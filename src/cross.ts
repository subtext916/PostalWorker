/**
 * Cross-window messaging over window.postMessage: iframes, popups and
 * windows on other origins.
 *
 * Windows find each other with a small handshake:
 *   child/popup --cross-hello--> parent/opener   (sent with targetOrigin "*", carries only an id)
 *   parent/opener --cross-ack--> child/popup     (sent to the exact origin)
 * A parent also sends `cross-probe` to its frames on startup, so frames that
 * loaded first still get registered. After that, every message is sent to the
 * registered window's exact origin, never "*".
 *
 * Incoming messages are accepted only from trusted origins:
 *   - this window's own origin
 *   - the parent (when framed) and the opener (when opened), from ancestorOrigins/referrer
 *   - iframes in this document, if the message comes from that frame and matches its src origin
 *   - windows opened with crossOn(url), if the message comes from that window and matches the url origin
 *   - anything in `allowedOrigins` (or everything when it is "*")
 */
import {
  envelope,
  isCrossWindowMsg,
  type Body,
  type CrossWindowMsg,
} from "./protocol";

export interface CrossTarget {
  id: string;
  win: Window;
  origin: string;
  relation: "parent" | "opener" | "child" | "opened" | "peer";
}

export interface CrossWindowsOptions {
  selfId: string;
  allowedOrigins: "*" | readonly string[];
  onMessage(msgClass: string, message: unknown, from: string, origin: string, back: boolean): void;
}

/** How long outgoing cross messages wait for the initial parent/opener handshake. */
const HANDSHAKE_WAIT_MS = 2000;

export class CrossWindows {
  readonly #opts: CrossWindowsOptions;
  readonly #targets = new Map<string, CrossTarget>();
  readonly #opened = new Map<Window, string>(); // window -> expected origin
  readonly #trusted = new Set<string>();
  #pending: Array<() => void> = [];
  #handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #listener = (e: MessageEvent): void => this.#onMessage(e);

  constructor(opts: CrossWindowsOptions) {
    this.#opts = opts;
    this.#trusted.add(location.origin);
    if (opts.allowedOrigins !== "*") for (const o of opts.allowedOrigins) this.#trusted.add(normalizeOrigin(o));

    const parentOrigin = this.isFramed ? guessParentOrigin() : undefined;
    if (parentOrigin) this.#trusted.add(parentOrigin);
    const opener = getOpener();
    const openerOrigin = opener ? referrerOrigin() : undefined;
    if (openerOrigin) this.#trusted.add(openerOrigin);

    window.addEventListener("message", this.#listener);

    // Announce ourselves to whoever created us.
    let waiting = false;
    if (this.isFramed) {
      this.#post(window.parent, "*", { kind: "cross-hello" });
      waiting = true;
    }
    if (opener) {
      this.#post(opener, "*", { kind: "cross-hello" });
      waiting = true;
    }
    if (waiting) this.#handshakeTimer = setTimeout(() => this.#flushPending(), HANDSHAKE_WAIT_MS);

    // Find frames that loaded before us.
    this.probeFrames();
  }

  get isFramed(): boolean {
    try {
      return window.self !== window.top;
    } catch {
      return true; // cross-origin top access throws only when framed
    }
  }

  /** Ask every child frame to say hello. */
  probeFrames(): void {
    for (let i = 0; i < window.frames.length; i++) {
      const frame = window.frames[i];
      if (frame) this.#post(frame, "*", { kind: "cross-probe" });
    }
  }

  /** Open a window and trust it (only that window, only at that url's origin). */
  open(url: string | URL, name: string, features: string): Window | null {
    const href = new URL(url, location.href);
    const win = window.open(href.href, name, features);
    if (!win) {
      console.warn(
        `PostalWorker: window.open("${href.href}") returned null (popup blocked, or "noopener" was set). That window cannot be messaged.`,
      );
      return null;
    }
    this.#opened.set(win, href.origin);
    return win;
  }

  /** Send to every registered window (crossFire). */
  send(msgClass: string, message: unknown): void {
    const go = (): void => {
      this.#prune();
      for (const t of this.#targets.values()) {
        this.#post(t.win, t.origin, { kind: "cross", msgClass, message, back: false });
      }
    };
    this.#whenHandshaken(go);
  }

  /** Send to the parent window only (backFire). Returns false when not framed. */
  sendBack(msgClass: string, message: unknown): boolean {
    if (!this.isFramed) return false;
    this.#whenHandshaken(() => {
      const parent = [...this.#targets.values()].find((t) => t.relation === "parent");
      if (parent) this.#post(parent.win, parent.origin, { kind: "cross", msgClass, message, back: true });
      else console.warn("PostalWorker: backFire dropped, the parent window never answered (is PostalWorker running there, and does it trust this origin?)");
    });
    return true;
  }

  /** Close and forget every window registered at this origin (or url's origin). */
  closeOrigin(urlOrOrigin: string | URL): void {
    const origin = normalizeOrigin(urlOrOrigin);
    for (const [id, t] of this.#targets) {
      if (t.origin !== origin) continue;
      if (t.relation === "opened") {
        try {
          t.win.close();
        } catch {
          /* ignore */
        }
      }
      this.#targets.delete(id);
    }
    for (const [win, o] of this.#opened) {
      if (o !== origin) continue;
      try {
        win.close();
      } catch {
        /* ignore */
      }
      this.#opened.delete(win);
    }
  }

  targets(): CrossTarget[] {
    this.#prune();
    return [...this.#targets.values()];
  }

  /** Tell every registered window we are leaving. */
  sayGoodbye(): void {
    for (const t of this.#targets.values()) this.#post(t.win, t.origin, { kind: "cross-bye" });
  }

  destroy(): void {
    this.sayGoodbye();
    window.removeEventListener("message", this.#listener);
    clearTimeout(this.#handshakeTimer);
    this.#targets.clear();
    this.#opened.clear();
    this.#pending = [];
  }

  // ---------------------------------------------------------------------------

  #onMessage(e: MessageEvent): void {
    const data: unknown = e.data;
    if (!isCrossWindowMsg(data)) return; // not ours: ignore silently
    const source = e.source;
    if (!isWindow(source)) return;
    if (data.from === this.#opts.selfId) return;
    if (!this.#isTrusted(e.origin, source)) {
      console.warn(
        `PostalWorker: ignored a message from untrusted origin ${e.origin}. Add it to "allowedOrigins" to accept it.`,
      );
      return;
    }

    switch (data.kind) {
      case "cross-probe":
        this.#post(source, e.origin, { kind: "cross-hello" });
        return;
      case "cross-hello":
        this.#register(data.from, source, e.origin);
        this.#post(source, e.origin, { kind: "cross-ack" });
        return;
      case "cross-ack":
        this.#register(data.from, source, e.origin);
        if (source === window.parent || source === getOpener()) this.#flushPending();
        return;
      case "cross-bye":
        this.#targets.delete(data.from);
        return;
      case "cross":
        if (!this.#targets.has(data.from)) this.#register(data.from, source, e.origin);
        this.#opts.onMessage(data.msgClass, data.message, data.from, e.origin, data.back);
        return;
    }
  }

  #register(id: string, win: Window, origin: string): void {
    let relation: CrossTarget["relation"] = "peer";
    if (this.isFramed && win === window.parent) relation = "parent";
    else if (win === getOpener()) relation = "opener";
    else if (this.#opened.has(win)) relation = "opened";
    else if (isChildFrame(win)) relation = "child";
    // A reloaded window comes back with a new id: drop its old entry.
    for (const [oldId, t] of this.#targets) if (t.win === win && oldId !== id) this.#targets.delete(oldId);
    this.#targets.set(id, { id, win, origin, relation });
  }

  #isTrusted(origin: string, source: Window): boolean {
    if (this.#opts.allowedOrigins === "*") return true;
    if (this.#trusted.has(origin)) return true;
    const expected = this.#opened.get(source);
    if (expected && expected === origin) return true;
    return isChildFrameAt(source, origin);
  }

  #whenHandshaken(fn: () => void): void {
    if (this.#handshakeTimer === undefined) fn();
    else this.#pending.push(fn);
  }

  #flushPending(): void {
    clearTimeout(this.#handshakeTimer);
    this.#handshakeTimer = undefined;
    const queued = this.#pending;
    this.#pending = [];
    for (const fn of queued) fn();
  }

  #prune(): void {
    for (const [id, t] of this.#targets) if (t.win.closed) this.#targets.delete(id);
    for (const win of this.#opened.keys()) if (win.closed) this.#opened.delete(win);
  }

  #post(win: Window, targetOrigin: string, body: Body<CrossWindowMsg>): void {
    try {
      win.postMessage(envelope(this.#opts.selfId, body), targetOrigin);
    } catch (error) {
      console.warn("PostalWorker: cross-window postMessage failed", error);
    }
  }
}

// ---- helpers ----------------------------------------------------------------

function isWindow(source: MessageEventSource | null): source is Window {
  // MessagePort and ServiceWorker sources have no `window` property
  return source !== null && typeof (source as Window).postMessage === "function" && "closed" in source;
}

function getOpener(): Window | null {
  try {
    const o: unknown = window.opener;
    return o && o !== window ? (o as Window) : null;
  } catch {
    return null;
  }
}

function normalizeOrigin(urlOrOrigin: string | URL): string {
  try {
    return new URL(urlOrOrigin, location.href).origin;
  } catch {
    return String(urlOrOrigin);
  }
}

function referrerOrigin(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return undefined;
  }
}

function guessParentOrigin(): string | undefined {
  const ancestors = location.ancestorOrigins;
  if (ancestors && ancestors.length > 0) return ancestors[0];
  return referrerOrigin();
}

function frameElements(): HTMLIFrameElement[] {
  return Array.from(document.querySelectorAll("iframe"));
}

function isChildFrame(win: Window): boolean {
  return frameElements().some((f) => f.contentWindow === win);
}

/** Is `win` the contentWindow of one of our iframes, and does `origin` match that iframe's src? */
function isChildFrameAt(win: Window, origin: string): boolean {
  for (const frame of frameElements()) {
    if (frame.contentWindow !== win) continue;
    try {
      return new URL(frame.src, location.href).origin === origin;
    } catch {
      return false;
    }
  }
  return false;
}

/** `{ width: 400, popup: true }` -> `"width=400,popup=yes"` */
export function windowFeatures(features: Record<string, string | number | boolean> | string | undefined): string {
  if (!features) return "";
  if (typeof features === "string") return features;
  return Object.entries(features)
    .map(([k, v]) => `${k}=${v === true ? "yes" : v === false ? "no" : String(v)}`)
    .join(",");
}
