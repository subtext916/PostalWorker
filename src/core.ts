/**
 * PostalWorker v5 core: one instance per tab (or per channel name).
 *
 *   tab ──┐                       ┌── tab
 *         ├── BroadcastChannel ───┤
 *   tab ──┘          │            └── tab
 *               SharedWorker  (or one elected dedicated Worker when SharedWorker is unavailable)
 *
 *   iframes / popups / other origins ── window.postMessage (see cross.ts)
 */
import { CrossWindows, windowFeatures, type CrossTarget } from "./cross";
import { Registry } from "./emitter";
import {
  WORKER_ID,
  assertNever,
  envelope,
  isChannelMsg,
  reachesTab,
  type Body,
  type ChannelMsg,
  type WireAudience,
} from "./protocol";
import type {
  AnySchema,
  Audience,
  BoxItem,
  BoxesOf,
  CrossMeta,
  EventsOf,
  KeyOf,
  MessageMeta,
  PackageItem,
  PackagesOf,
  Schema,
  Unsubscribe,
} from "./types";

export type WorkerMode = "shared" | "dedicated" | "none";

export interface PostalConfig {
  /**
   * URL of the worker script (`dist/PostalSharedWorker.js`, served from your site).
   * `false` runs without a worker: tabs, iframes and popups still talk, but
   * postBox, package and load() need the worker.
   */
  workerUrl: string | URL | false;
  /** Name of the BroadcastChannel and worker. Instances with different names are isolated. Default `"PostalWorker"`. */
  channelName?: string;
  /**
   * What to do where SharedWorker is unavailable (e.g. Samsung Internet, iOS < 16).
   * `"dedicated"` (default) elects one tab with Web Locks to host a dedicated Worker
   * that every tab shares; another tab takes over when it closes.
   * `"none"` runs without a worker there.
   */
  fallback?: "dedicated" | "none";
  /**
   * Extra origins allowed to send cross-window messages, or `"*"` to accept any origin.
   * Your own origin, your parent/opener, iframes you embed and windows you open are trusted already.
   */
  allowedOrigins?: "*" | readonly string[];
  /** Milliseconds to wait for the worker before sending queued messages anyway. Default 5000. */
  readyTimeout?: number;
  /** Called for worker errors (e.g. a load() script failed). Defaults to console.error. */
  onError?: (error: Error) => void;
}

export type EventHandler<T> = (message: T, meta: MessageMeta) => void;
export type CrossHandler<T> = (message: T, meta: CrossMeta) => void;

export interface CrossOnOptions {
  /** Window name passed to window.open (default `"_blank"`). */
  name?: string;
  /** window.open features, as a string or object: `{ popup: true, width: 400 }`. Do not set `noopener`. */
  features?: string | Record<string, string | number | boolean>;
}

/** The PostalWorker instance API. */
export interface PostalWorker<S extends Schema = AnySchema> {
  /** Unique id of this tab's instance. Use it with `fire(…, { to: id })`. */
  readonly id: string;
  /** How this tab reaches the worker. */
  readonly mode: WorkerMode;
  /** True once the worker has answered. */
  readonly workerOnline: boolean;
  /** True when this window is inside an iframe. */
  readonly isFramed: boolean;
  /** Resolves `true` when the worker is online, `false` if there is none or it never answered. */
  ready(): Promise<boolean>;

  /** Listen for a message class. Returns an unsubscribe function. */
  on<K extends KeyOf<EventsOf<S>>>(msgClass: K, handler: EventHandler<EventsOf<S>[K]>): Unsubscribe;
  /** Remove one handler, or every handler for the class. */
  off<K extends KeyOf<EventsOf<S>>>(msgClass: K, handler?: EventHandler<EventsOf<S>[K]>): void;
  /** Send a message. Default audience `"all"`: this tab, other tabs and the worker. */
  fire<K extends KeyOf<EventsOf<S>>>(msgClass: K, message: EventsOf<S>[K], audience?: Audience): void;

  /**
   * Listen for cross-window messages (iframes, popups, other origins).
   * With `url`, also opens that window and trusts it.
   */
  crossOn<K extends KeyOf<EventsOf<S>>>(
    msgClass: K,
    handler: CrossHandler<EventsOf<S>[K]>,
    url?: string | URL,
    options?: CrossOnOptions,
  ): Unsubscribe;
  /** Remove one cross handler, or every cross handler for the class. */
  crossOff<K extends KeyOf<EventsOf<S>>>(msgClass: K, handler?: CrossHandler<EventsOf<S>[K]>): void;
  /** Send to every connected iframe, parent, popup and opener. */
  crossFire<K extends KeyOf<EventsOf<S>>>(msgClass: K, message: EventsOf<S>[K]): void;
  /** Send to the parent window only (inside an iframe). */
  backFire<K extends KeyOf<EventsOf<S>>>(msgClass: K, message: EventsOf<S>[K]): void;
  /** `fire(…, "all")` plus `crossFire`. */
  fireAll<K extends KeyOf<EventsOf<S>>>(msgClass: K, message: EventsOf<S>[K]): void;
  /** Close (if opened) and forget windows at this url's origin. */
  closeWindows(urlOrOrigin: string | URL): void;
  /** Windows currently connected through cross-window messaging. */
  windows(): ReadonlyArray<Pick<CrossTarget, "id" | "origin" | "relation">>;

  /** Load a classic script into the worker. It must define `self.init = (pw) => { … }`. */
  load(url: string | URL): void;

  /** Open a shared value box. The handler gets the current value, then every change. Returns closeBox. */
  postBox<K extends KeyOf<BoxesOf<S>>>(address: K, handler: (item: BoxItem<BoxesOf<S>, K>) => void): Unsubscribe;
  /** Set a box's value for everyone. */
  post<K extends KeyOf<BoxesOf<S>>>(address: K, value: BoxesOf<S>[K]): void;
  /** Close a box in this tab. Its handlers get one last call with `value: null, closed: true`. */
  closeBox<K extends KeyOf<BoxesOf<S>>>(address: K): void;

  /** Receive packaged content (any structured-cloneable value, e.g. a Blob). Returns an unsubscribe function. */
  package<K extends KeyOf<PackagesOf<S>>>(address: K, handler: (item: PackageItem<PackagesOf<S>, K>) => void): Unsubscribe;
  /** Store content in a package and deliver it to every subscriber. */
  pack<K extends KeyOf<PackagesOf<S>>>(address: K, content: PackagesOf<S>[K]): void;

  /** Stop everything: leave the network, close the channel, release the worker. */
  destroy(): void;
}

const DEFAULT_CHANNEL = "PostalWorker";

interface BoxState {
  handlers: Set<(item: BoxItem<Record<string, unknown>, string>) => void>;
  last?: { value: unknown; box: Record<string, unknown> };
  closing: boolean;
}
interface PackageState {
  handlers: Set<(item: PackageItem<Record<string, unknown>, string>) => void>;
  last?: { content: unknown };
}

/**
 * Create a PostalWorker instance. Call once per tab (per channel name) and share it.
 * Safe to call during server-side rendering: it returns an instance that does nothing.
 */
export function createPostalWorker<S extends Schema = AnySchema>(config: PostalConfig): PostalWorker<S> {
  return new PostalWorkerImpl(config) as unknown as PostalWorker<S>;
}

type AnyHandler = (message: unknown, meta: MessageMeta) => void;
type AnyCrossHandler = (message: unknown, meta: CrossMeta) => void;

class PostalWorkerImpl {
  readonly id: string;
  #mode: WorkerMode = "none";
  #online = false;
  #gaveUp = false;
  #destroyed = false;

  readonly #config: PostalConfig;
  readonly #channelName: string;
  readonly #inert: boolean;
  #channel: BroadcastChannel | undefined;
  #cross: CrossWindows | undefined;
  #worker: SharedWorker | Worker | undefined;
  #releaseLeader: (() => void) | undefined;
  #workerInstance: string | undefined;
  #readyTimer: ReturnType<typeof setTimeout> | undefined;
  #queue: Array<Body<ChannelMsg>> = [];
  readonly #readyWaiters: Array<(online: boolean) => void> = [];

  readonly #events = new Registry<AnyHandler>();
  readonly #crossEvents = new Registry<AnyCrossHandler>();
  readonly #boxes = new Map<string, BoxState>();
  readonly #packages = new Map<string, PackageState>();
  readonly #loaded = new Set<string>();

  readonly #onChannel = (e: MessageEvent): void => this.#handleChannel(e.data);
  readonly #onPageHide = (): void => {
    this.#post({ kind: "leave" });
    this.#cross?.sayGoodbye();
  };
  readonly #onPageShow = (e: PageTransitionEvent): void => {
    if (!e.persisted) return; // only back/forward cache restores
    this.#post({ kind: "join" });
    this.#post({ kind: "hello" });
    this.#cross?.probeFrames();
  };

  constructor(config: PostalConfig) {
    this.#config = config;
    this.#channelName = config.channelName ?? DEFAULT_CHANNEL;
    this.id = newId();
    this.#inert = typeof window === "undefined" || typeof BroadcastChannel === "undefined";
    if (this.#inert) return;

    this.#channel = new BroadcastChannel(this.#channelName);
    this.#channel.addEventListener("message", this.#onChannel);

    this.#cross = new CrossWindows({
      selfId: this.id,
      allowedOrigins: config.allowedOrigins ?? [],
      onMessage: (msgClass, message, from, origin) => this.#crossEvents.emit(msgClass, message, { from, origin }),
    });

    window.addEventListener("pagehide", this.#onPageHide);
    window.addEventListener("pageshow", this.#onPageShow);

    this.#post({ kind: "join" });
    this.#startWorker();
  }

  get mode(): WorkerMode {
    return this.#mode;
  }
  get workerOnline(): boolean {
    return this.#online;
  }
  get isFramed(): boolean {
    return this.#cross?.isFramed ?? false;
  }

  ready(): Promise<boolean> {
    if (this.#online) return Promise.resolve(true);
    if (this.#gaveUp || this.#inert || this.#destroyed) return Promise.resolve(false);
    return new Promise((resolve) => this.#readyWaiters.push(resolve));
  }

  // ---- events -------------------------------------------------------------

  on(msgClass: string, handler: AnyHandler): Unsubscribe {
    return this.#events.add(msgClass, handler);
  }

  off(msgClass: string, handler?: AnyHandler): void {
    this.#events.remove(msgClass, handler);
  }

  fire(msgClass: string, message: unknown, audience: Audience = "all"): void {
    const toSelf = audience === "all" || audience === "local" || (typeof audience === "object" && audience.to === this.id);
    if (toSelf) {
      // async, like every other delivery, so ordering is the same for every listener
      queueMicrotask(() => this.#events.emit(msgClass, message, { from: this.id }));
    }
    if (audience === "local") return;
    if (typeof audience === "object" && audience.to === this.id) return;
    this.#post({ kind: "fire", msgClass, message, audience: audience as WireAudience });
  }

  // ---- cross-window ---------------------------------------------------------

  crossOn(msgClass: string, handler: AnyCrossHandler, url?: string | URL, options: CrossOnOptions = {}): Unsubscribe {
    const off = this.#crossEvents.add(msgClass, handler);
    if (url !== undefined && this.#cross) {
      this.#cross.open(url, options.name ?? "_blank", windowFeatures(options.features));
    }
    return off;
  }

  crossOff(msgClass: string, handler?: AnyCrossHandler): void {
    this.#crossEvents.remove(msgClass, handler);
  }

  crossFire(msgClass: string, message: unknown): void {
    this.#cross?.send(msgClass, message);
  }

  backFire(msgClass: string, message: unknown): void {
    if (this.#cross && !this.#cross.sendBack(msgClass, message)) {
      console.warn("PostalWorker: backFire() only works inside an iframe");
    }
  }

  fireAll(msgClass: string, message: unknown): void {
    this.fire(msgClass, message, "all");
    this.crossFire(msgClass, message);
  }

  closeWindows(urlOrOrigin: string | URL): void {
    this.#cross?.closeOrigin(urlOrOrigin);
  }

  windows(): Array<Pick<CrossTarget, "id" | "origin" | "relation">> {
    return (this.#cross?.targets() ?? []).map(({ id, origin, relation }) => ({ id, origin, relation }));
  }

  // ---- worker scripts -------------------------------------------------------

  load(url: string | URL): void {
    const href = this.#inert ? String(url) : new URL(url, window.location.href).href;
    if (!this.#requireWorker("load()")) return;
    this.#loaded.add(href);
    this.#post({ kind: "load", url: href });
  }

  // ---- post boxes -----------------------------------------------------------

  postBox(address: string, handler: (item: BoxItem<Record<string, unknown>, string>) => void): Unsubscribe {
    let state = this.#boxes.get(address);
    if (!state || state.closing) {
      state = { handlers: new Set(), closing: false };
      this.#boxes.set(address, state);
      state.handlers.add(handler);
      if (this.#requireWorker("postBox()")) this.#post({ kind: "box-open", address });
    } else {
      state.handlers.add(handler);
      const last = state.last;
      if (last) queueMicrotask(() => handler({ address, value: last.value, box: last.box, closed: false }));
    }
    const s = state;
    return () => {
      s.handlers.delete(handler);
      if (s.handlers.size === 0 && this.#boxes.get(address) === s) this.closeBox(address);
    };
  }

  post(address: string, value: unknown): void {
    if (!this.#requireWorker("post()")) return;
    this.#post({ kind: "box-post", address, value });
  }

  closeBox(address: string): void {
    const state = this.#boxes.get(address);
    if (!state || state.closing) return;
    state.closing = true;
    if (this.#mode === "none" || this.#gaveUp) {
      this.#finishClose(address, state.last?.box ?? {});
      return;
    }
    this.#post({ kind: "box-close", address });
  }

  // ---- packages -------------------------------------------------------------

  package(address: string, handler: (item: PackageItem<Record<string, unknown>, string>) => void): Unsubscribe {
    let state = this.#packages.get(address);
    if (!state) {
      state = { handlers: new Set() };
      this.#packages.set(address, state);
      state.handlers.add(handler);
      if (this.#requireWorker("package()")) this.#post({ kind: "package-open", address });
    } else {
      state.handlers.add(handler);
      const last = state.last;
      if (last) queueMicrotask(() => handler({ address, content: last.content }));
    }
    const s = state;
    return () => {
      s.handlers.delete(handler);
      if (s.handlers.size === 0 && this.#packages.get(address) === s) this.#packages.delete(address);
    };
  }

  pack(address: string, content: unknown): void {
    if (!this.#requireWorker("pack()")) return;
    this.#post({ kind: "package-pack", address, content });
  }

  // ---- lifecycle ------------------------------------------------------------

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#inert) return;
    this.#onPageHide();
    this.#flushQueue();
    window.removeEventListener("pagehide", this.#onPageHide);
    window.removeEventListener("pageshow", this.#onPageShow);
    this.#channel?.removeEventListener("message", this.#onChannel);
    this.#channel?.close();
    this.#cross?.destroy();
    if (this.#worker instanceof Worker) this.#worker.terminate();
    this.#worker = undefined;
    this.#releaseLeader?.();
    clearTimeout(this.#readyTimer);
    this.#resolveReady(false);
    this.#events.clear();
    this.#crossEvents.clear();
    this.#boxes.clear();
    this.#packages.clear();
  }

  // ---------------------------------------------------------------------------

  #startWorker(): void {
    const { workerUrl } = this.#config;
    if (workerUrl === false) {
      this.#mode = "none";
      this.#giveUp();
      return;
    }
    const url = new URL(workerUrl, window.location.href).href;
    const options: WorkerOptions = { name: this.#channelName };

    if (typeof SharedWorker === "function") {
      try {
        const worker = new SharedWorker(url, options);
        worker.addEventListener("error", () => this.#workerFailed(`could not start SharedWorker ${url}`));
        worker.port.start();
        this.#worker = worker;
        this.#mode = "shared";
        this.#post({ kind: "hello" });
        this.#armReadyTimer();
        return;
      } catch (error) {
        console.warn("PostalWorker: SharedWorker failed to start, trying the fallback", error);
      }
    }

    if ((this.#config.fallback ?? "dedicated") === "none" || typeof Worker !== "function") {
      this.#mode = "none";
      this.#giveUp();
      return;
    }
    if (!navigator.locks) {
      // Without Web Locks every tab would start its own worker and state would split.
      this.#mode = "none";
      this.#reportError(new Error("PostalWorker: no SharedWorker or Web Locks here; running without a worker"));
      this.#giveUp();
      return;
    }

    this.#mode = "dedicated";
    this.#post({ kind: "hello" }); // a leader tab may already be hosting the worker
    this.#armReadyTimer();
    void navigator.locks.request(`${this.#channelName}:worker-leader`, () => {
      if (this.#destroyed) return undefined;
      try {
        const worker = new Worker(url, options);
        worker.addEventListener("error", () => this.#workerFailed(`could not start Worker ${url}`));
        this.#worker = worker;
      } catch (error) {
        this.#workerFailed(`could not start Worker ${url}: ${String(error)}`);
        return undefined;
      }
      // hold the lock (and the worker) until this tab goes away
      return new Promise<void>((resolve) => {
        this.#releaseLeader = resolve;
      });
    });
  }

  #armReadyTimer(): void {
    clearTimeout(this.#readyTimer);
    this.#readyTimer = setTimeout(() => {
      if (this.#online) return;
      this.#reportError(new Error(`PostalWorker: worker did not answer within ${this.#config.readyTimeout ?? 5000}ms`));
      this.#giveUp();
    }, this.#config.readyTimeout ?? 5000);
  }

  #workerFailed(reason: string): void {
    if (this.#online) return;
    this.#mode = "none";
    this.#reportError(new Error(`PostalWorker: ${reason}`));
    this.#giveUp();
  }

  /** Stop waiting for the worker: send whatever is queued. */
  #giveUp(): void {
    if (this.#online) return;
    this.#gaveUp = true;
    clearTimeout(this.#readyTimer);
    this.#flushQueue();
    this.#resolveReady(false);
  }

  #requireWorker(what: string): boolean {
    if (this.#inert) return false;
    if (this.#mode === "none") {
      this.#reportError(new Error(`PostalWorker: ${what} needs the worker, but this instance has none`));
      return false;
    }
    return true;
  }

  #handleChannel(data: unknown): void {
    if (!isChannelMsg(data) || data.from === this.id) return;
    switch (data.kind) {
      case "fire":
        if (reachesTab(data.audience, this.id)) this.#events.emit(data.msgClass, data.message, { from: data.from });
        return;
      case "worker-ready":
        this.#workerReady(data.instance);
        return;
      case "box-update": {
        if (data.to !== undefined && data.to !== this.id) return;
        const state = this.#boxes.get(data.address);
        if (!state || state.closing) return;
        state.last = { value: data.value, box: data.box };
        for (const h of [...state.handlers]) safeCall(() => h({ address: data.address, value: data.value, box: data.box, closed: false }));
        return;
      }
      case "box-closed":
        if (data.to === this.id) this.#finishClose(data.address, data.box);
        return;
      case "package-update": {
        if (data.to !== undefined && data.to !== this.id) return;
        const state = this.#packages.get(data.address);
        if (!state) return;
        // a late "nothing packed yet" reply must not erase content we already have
        if (data.to !== undefined && data.content === null && state.last) return;
        state.last = { content: data.content };
        for (const h of [...state.handlers]) safeCall(() => h({ address: data.address, content: data.content }));
        return;
      }
      case "error":
        if (data.to === undefined || data.to === this.id) this.#reportError(new Error(data.message));
        return;
      // messages meant for the worker
      case "hello":
      case "join":
      case "leave":
      case "box-open":
      case "box-post":
      case "box-close":
      case "package-open":
      case "package-pack":
      case "load":
        return;
      default:
        assertNever(data);
    }
  }

  #workerReady(instance: string): void {
    const previous = this.#workerInstance;
    if (previous === instance) return;
    this.#workerInstance = instance;
    clearTimeout(this.#readyTimer);

    // (re)announce membership: a join sent before the worker started was not seen
    this.#post({ kind: "join" }, true);
    if (previous !== undefined) {
      // A new worker took over (fallback leader handover, or the SharedWorker restarted):
      // give it back the state this tab knows about.
      for (const url of this.#loaded) this.#post({ kind: "load", url }, true);
      for (const [address, state] of this.#boxes) {
        if (state.closing) continue;
        const v = state.last?.value;
        this.#post(v === undefined || v === null ? { kind: "box-open", address } : { kind: "box-open", address, seed: { value: v } }, true);
      }
      for (const address of this.#packages.keys()) this.#post({ kind: "package-open", address }, true);
    }

    this.#online = true;
    this.#gaveUp = false;
    this.#flushQueue();
    this.#resolveReady(true);
  }

  #finishClose(address: string, box: Record<string, unknown>): void {
    const state = this.#boxes.get(address);
    if (!state) return;
    this.#boxes.delete(address);
    for (const h of [...state.handlers]) safeCall(() => h({ address, value: null, box, closed: true }));
  }

  /** Send on the channel; queued until the worker answers (or we stop waiting). */
  #post(body: Body<ChannelMsg>, immediate = false): void {
    if (!this.#channel || this.#destroyed && body.kind !== "leave") return;
    const waiting = this.#mode !== "none" && !this.#online && !this.#gaveUp;
    if (waiting && !immediate && body.kind !== "hello" && body.kind !== "join") {
      this.#queue.push(body);
      return;
    }
    this.#channel.postMessage(envelope(this.id, body));
  }

  #flushQueue(): void {
    const queued = this.#queue;
    this.#queue = [];
    for (const body of queued) this.#channel?.postMessage(envelope(this.id, body));
  }

  #resolveReady(online: boolean): void {
    for (const resolve of this.#readyWaiters.splice(0)) resolve(online);
  }

  #reportError(error: Error): void {
    if (this.#config.onError) safeCall(() => this.#config.onError?.(error));
    else console.error(error);
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

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// re-export for consumers who only import core
export { WORKER_ID };
