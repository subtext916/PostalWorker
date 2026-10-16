/**
 * v4 compatibility: `PostalWorker()` returns one shared instance with the v4
 * method names and return values. New code should use `createPostalWorker`.
 *
 * Differences from v4 that are bug fixes, not API changes:
 *  - several `on()` handlers per message class are allowed (v4 kept only the last)
 *  - `fire()` also reaches handlers in the sending tab (as the original design did)
 *  - non-PostalWorker postMessage traffic is ignored instead of throwing
 *  - `crossOn()` works inside iframes
 */
import { createPostalWorker, type PostalWorker as V5, type PostalConfig } from "./core";
import type { Audience } from "./types";

export interface LegacyConfig {
  /** Folder that serves PostalSharedWorker.js (v4 option). */
  PostalRoute?: string;
  /** v4 accepted messages from any origin, so the default here is "*". Pass a list to tighten it. */
  allowedOrigins?: PostalConfig["allowedOrigins"];
  channelName?: string;
  onError?: (error: Error) => void;
}

/** v4 audience names, plus v5 values. */
export type LegacyAudience = "ALL" | "PUBLIC" | Audience;

export interface LegacyPostalWorker {
  readonly id: string;
  readonly sharedWorkerSupported: boolean;
  readonly workerOnline: boolean;
  on(msgClass: string, action: (msg: any) => void): LegacyPostalWorker;
  un(msgClass: string): boolean;
  fire(msgClass: string, msg?: any, audience?: LegacyAudience): boolean;
  crossOn(
    msgClass: string,
    action: (msg: any) => void,
    subscriber?: string,
    name?: string,
    windowparams?: Record<string, string | number | boolean> | false,
  ): LegacyPostalWorker;
  unCross(msgClass: string, subscriber?: string): LegacyPostalWorker;
  crossFire(msgClass: string, msg?: any): LegacyPostalWorker;
  fireAll(msgClass: string, msg?: any): LegacyPostalWorker;
  backFire(msgClass: string, msg?: any): LegacyPostalWorker;
  load(library: string): void;
  postBox(address: string, callback: (item: { address: string; value: any; box: Record<string, any> }) => void): void;
  post(address: string, value: any): void;
  closeBox(address: string): void;
  package(address: string, handling: (item: { address: string; content: any }) => void): void;
  /** v4 behavior: fetches `url` and packs it as a data: URL string. */
  pack(address: string, url: string): void;
  /** The v5 instance underneath, for gradual migration. */
  readonly v5: V5;
}

let singleton: LegacyPostalWorker | undefined;

/** v4 entry point. The first call's configuration wins; later calls return the same instance. */
export default function PostalWorker(configuration?: LegacyConfig | null): LegacyPostalWorker {
  singleton ??= createLegacy(configuration ?? {});
  return singleton;
}

function createLegacy(config: LegacyConfig): LegacyPostalWorker {
  const route = config.PostalRoute ?? detectPostalRoute();
  const v5 = createPostalWorker({
    workerUrl: joinRoute(route, "PostalSharedWorker.js"),
    allowedOrigins: config.allowedOrigins ?? "*",
    ...(config.channelName !== undefined && { channelName: config.channelName }),
    ...(config.onError !== undefined && { onError: config.onError }),
  });

  const legacy: LegacyPostalWorker = {
    get id() {
      return v5.id;
    },
    get sharedWorkerSupported() {
      return typeof SharedWorker === "function";
    },
    get workerOnline() {
      return v5.workerOnline;
    },
    on(msgClass, action) {
      v5.on(msgClass, (m) => action(m));
      return legacy;
    },
    un(msgClass) {
      v5.off(msgClass);
      return true;
    },
    fire(msgClass, msg, audience) {
      v5.fire(msgClass, msg, toAudience(audience));
      return true;
    },
    crossOn(msgClass, action, subscriber, name, windowparams) {
      v5.crossOn(msgClass, (m) => action(m), subscriber, {
        ...(name !== undefined && { name }),
        ...(windowparams ? { features: windowparams } : {}),
      });
      return legacy;
    },
    unCross(msgClass, subscriber) {
      v5.crossOff(msgClass);
      if (subscriber) v5.closeWindows(subscriber);
      return legacy;
    },
    crossFire(msgClass, msg) {
      v5.crossFire(msgClass, msg);
      return legacy;
    },
    fireAll(msgClass, msg) {
      v5.fireAll(msgClass, msg);
      return legacy;
    },
    backFire(msgClass, msg) {
      v5.backFire(msgClass, msg);
      return legacy;
    },
    load(library) {
      v5.load(library);
    },
    postBox(address, callback) {
      v5.postBox(address, ({ address: a, value, box }) => callback({ address: a, value, box }));
    },
    post(address, value) {
      v5.post(address, value);
    },
    closeBox(address) {
      v5.closeBox(address);
    },
    package(address, handling) {
      v5.package(address, ({ address: a, content }) => handling({ address: a, content }));
    },
    pack(address, url) {
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then(blobToDataUrl)
        .then((content) => v5.pack(address, content))
        .catch((error: unknown) => console.error(`PostalWorker: pack("${address}", "${url}") failed`, error));
    },
    get v5() {
      return v5;
    },
  };
  return legacy;
}

function toAudience(audience: LegacyAudience | undefined): Audience {
  if (audience === undefined || audience === "ALL") return "all";
  if (audience === "PUBLIC") return "others";
  return audience;
}

function joinRoute(route: string, file: string): string {
  if (!route) return file;
  return route.endsWith("/") ? route + file : `${route}/${file}`;
}

/**
 * v4 route detection: `?PostalRoute=` on a PostalWorker script tag, otherwise
 * the folder that script was loaded from, otherwise the page's folder.
 */
function detectPostalRoute(): string {
  if (typeof document === "undefined") return "";
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).filter((s) =>
    /PostalWorker[^/]*\.js(\?|#|$)/.test(s.src),
  );
  if (scripts.length > 1) console.warn('PostalWorker: found more than one script tag matching "PostalWorker"; using the first');
  const script = scripts[0];
  if (!script) return "";
  const url = new URL(script.src, window.location.href);
  const fromQuery = url.searchParams.get("PostalRoute");
  if (fromQuery !== null) return fromQuery;
  return url.href.slice(0, url.href.length - url.pathname.length) + url.pathname.replace(/[^/]*$/, "");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
