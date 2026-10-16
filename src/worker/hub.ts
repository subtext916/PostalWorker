/**
 * The worker side of PostalWorker. Runs inside the SharedWorker, or inside
 * the single dedicated Worker hosted by the elected tab (fallback mode).
 * Owns shared state (boxes, packages, loaded scripts) and talks to every tab
 * over the BroadcastChannel.
 */
import { Registry } from "../emitter";
import {
  WORKER_ID,
  assertNever,
  envelope,
  isChannelMsg,
  reachesWorker,
  type Body,
  type ChannelMsg,
} from "../protocol";
import type { BoxItem, MessageMeta, PackageItem, Unsubscribe } from "../types";
import type { WorkerApi, WorkerAudience, WorkerScriptApi } from "../worker-script";

type AnyHandler = (message: unknown, meta: MessageMeta) => void;
type BoxHandler = (item: BoxItem<Record<string, unknown>, string>) => void;
type PackageHandler = (item: PackageItem<Record<string, unknown>, string>) => void;

interface Box {
  members: Set<string>;
  value: unknown;
  handlers: Set<BoxHandler>;
}
interface Package {
  content: unknown;
  handlers: Set<PackageHandler>;
}

export class Hub {
  readonly instance = randomId();
  readonly #channel: BroadcastChannel;
  readonly #events = new Registry<AnyHandler>();
  readonly #boxes = new Map<string, Box>();
  readonly #packages = new Map<string, Package>();
  readonly #loaded = new Set<string>();
  readonly #members = new Set<string>();
  readonly #streams = new Map<string, EventSource>();
  readonly api: WorkerScriptApi;

  constructor(channelName: string) {
    this.#channel = new BroadcastChannel(channelName);
    this.#channel.addEventListener("message", (e: MessageEvent) => this.#handle(e.data));
    this.api = this.#createApi();
  }

  /** Tell every tab this worker instance is up. */
  announce(): void {
    this.#post({ kind: "worker-ready", instance: this.instance });
  }

  // ---------------------------------------------------------------------------

  #handle(data: unknown): void {
    if (!isChannelMsg(data) || data.from === WORKER_ID) return;
    const from = data.from;
    switch (data.kind) {
      case "hello":
        this.#members.add(from);
        this.announce();
        return;
      case "join":
        this.#members.add(from);
        return;
      case "leave":
        this.#members.delete(from);
        for (const [address, box] of this.#boxes) {
          box.members.delete(from);
          this.#dropIfUnused(address, box);
        }
        return;
      case "fire":
        if (reachesWorker(data.audience)) this.#events.emit(data.msgClass, data.message, { from });
        return;
      case "box-open": {
        this.#members.add(from);
        const box = this.#box(data.address);
        box.members.add(from);
        if (data.seed && (box.value === null || box.value === undefined) && data.seed.value !== null) {
          this.#setBox(data.address, box, data.seed.value);
        }
        this.#post({ kind: "box-update", address: data.address, value: box.value, box: this.#snapshot(), to: from });
        return;
      }
      case "box-post":
        this.#setBox(data.address, this.#box(data.address), data.value);
        return;
      case "box-close": {
        const box = this.#boxes.get(data.address);
        if (box) {
          box.members.delete(from);
          this.#dropIfUnused(data.address, box);
        }
        this.#post({ kind: "box-closed", address: data.address, box: this.#snapshot(), to: from });
        return;
      }
      case "package-open": {
        const pkg = this.#package(data.address);
        this.#post({ kind: "package-update", address: data.address, content: pkg.content, to: from });
        return;
      }
      case "package-pack":
        this.#setPackage(data.address, data.content);
        return;
      case "load":
        this.#load(data.url, from);
        return;
      // messages meant for tabs
      case "worker-ready":
      case "box-update":
      case "box-closed":
      case "package-update":
      case "error":
        return;
      default:
        assertNever(data);
    }
  }

  #box(address: string): Box {
    let box = this.#boxes.get(address);
    if (!box) {
      box = { members: new Set(), value: null, handlers: new Set() };
      this.#boxes.set(address, box);
    }
    return box;
  }

  #setBox(address: string, box: Box, value: unknown): void {
    box.value = value;
    const snapshot = this.#snapshot();
    this.#post({ kind: "box-update", address, value, box: snapshot });
    for (const h of [...box.handlers]) safeCall(() => h({ address, value, box: snapshot, closed: false }));
  }

  /** Forget a box nobody uses (no tab has it open and no worker handler). Values posted to unopened boxes are kept. */
  #dropIfUnused(address: string, box: Box): void {
    if (box.members.size === 0 && box.handlers.size === 0) this.#boxes.delete(address);
  }

  #snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [address, box] of this.#boxes) out[address] = box.value;
    return out;
  }

  #package(address: string): Package {
    let pkg = this.#packages.get(address);
    if (!pkg) {
      pkg = { content: null, handlers: new Set() };
      this.#packages.set(address, pkg);
    }
    return pkg;
  }

  #setPackage(address: string, content: unknown): void {
    const pkg = this.#package(address);
    pkg.content = content;
    this.#post({ kind: "package-update", address, content });
    for (const h of [...pkg.handlers]) safeCall(() => h({ address, content }));
  }

  #load(url: string, from: string): void {
    if (this.#loaded.has(url)) return;
    const scope = globalThis as { init?: unknown };
    delete scope.init;
    try {
      importScripts(url);
      const init = scope.init;
      delete scope.init;
      if (typeof init !== "function") {
        throw new Error(`${url} did not define self.init = (pw) => { … }`);
      }
      this.#loaded.add(url);
      (init as (pw: WorkerScriptApi) => void)(this.api);
    } catch (error) {
      this.#post({
        kind: "error",
        message: `PostalWorker: could not load ${url} into the worker: ${error instanceof Error ? error.message : String(error)}`,
        to: from,
      });
    }
  }

  #post(body: Body<ChannelMsg>): void {
    this.#channel.postMessage(envelope(WORKER_ID, body));
  }

  #createApi(): WorkerScriptApi {
    const api: WorkerApi = {
      id: WORKER_ID,
      on: (msgClass, handler) => this.#events.add(msgClass, handler as AnyHandler),
      off: (msgClass, handler) => this.#events.remove(msgClass, handler as AnyHandler | undefined),
      fire: (msgClass, message, audience: WorkerAudience = "all") => {
        if (audience === "all" || audience.to === WORKER_ID) {
          queueMicrotask(() => this.#events.emit(msgClass, message, { from: WORKER_ID }));
        }
        if (typeof audience === "object" && audience.to === WORKER_ID) return;
        this.#post({ kind: "fire", msgClass, message, audience });
      },
      postBox: (address, handler) => {
        const box = this.#box(address);
        const h = handler as BoxHandler;
        box.handlers.add(h);
        queueMicrotask(() => safeCall(() => h({ address, value: box.value, box: this.#snapshot(), closed: false })));
        return () => {
          box.handlers.delete(h);
          this.#dropIfUnused(address, box);
        };
      },
      post: (address, value) => this.#setBox(address, this.#box(address), value),
      closeBox: (address) => {
        const box = this.#boxes.get(address);
        if (!box) return;
        const handlers = [...box.handlers];
        box.handlers.clear();
        this.#dropIfUnused(address, box);
        const snapshot = this.#snapshot();
        for (const h of handlers) safeCall(() => h({ address, value: null, box: snapshot, closed: true }));
      },
      package: (address, handler): Unsubscribe => {
        const pkg = this.#package(address);
        const h = handler as PackageHandler;
        pkg.handlers.add(h);
        queueMicrotask(() => safeCall(() => h({ address, content: pkg.content })));
        return () => pkg.handlers.delete(h);
      },
      pack: (address, content) => this.#setPackage(address, content),
      subscribe: (url, onMessage, onError) => {
        let stream = this.#streams.get(url);
        if (!stream) {
          stream = new EventSource(url);
          this.#streams.set(url, stream);
        }
        const s = stream;
        const msg = (e: MessageEvent<string>): void => onMessage(e);
        s.addEventListener("message", msg);
        const err = onError ? (e: Event): void => onError(e) : undefined;
        if (err) s.addEventListener("error", err);
        return () => {
          s.removeEventListener("message", msg);
          if (err) s.removeEventListener("error", err);
        };
      },
      members: () => [...this.#members],
    };
    // v4 scripts call PostalWorker().on(…); v5 scripts call pw.on(…). Support both.
    return Object.assign(() => api, api) as WorkerScriptApi;
  }
}

function safeCall(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

function randomId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
