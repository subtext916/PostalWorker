/**
 * Types and helper for scripts loaded into the worker with `postal.load(url)`.
 *
 * A worker script is a classic script (bundle it as IIFE) that defines
 * `self.init`. PostalWorker calls it once with the worker-side API:
 *
 * ```ts
 * import { defineWorkerScript } from "postalworker-es/worker-script";
 * import type { AppSchema } from "./schema";
 *
 * defineWorkerScript<AppSchema>((pw) => {
 *   pw.on("ping", (n, { from }) => pw.fire("pong", n + 1, { to: from }));
 * });
 * ```
 *
 * For v4 scripts, the API is also callable: `PostalWorker().on(…)` keeps working.
 */
import type {
  AnySchema,
  BoxItem,
  BoxesOf,
  EventsOf,
  KeyOf,
  MessageMeta,
  PackageItem,
  PackagesOf,
  Schema,
  Unsubscribe,
} from "./types";

/** Who receives a `fire()` from the worker. */
export type WorkerAudience = "all" | { to: string };

export interface WorkerApi<S extends Schema = AnySchema> {
  /** Always `"worker"`; tabs see it as `meta.from`. */
  readonly id: "worker";
  on<K extends KeyOf<EventsOf<S>>>(msgClass: K, handler: (message: EventsOf<S>[K], meta: MessageMeta) => void): Unsubscribe;
  off<K extends KeyOf<EventsOf<S>>>(msgClass: K, handler?: (message: EventsOf<S>[K], meta: MessageMeta) => void): void;
  /** Send to every tab (and the worker's own handlers), or to one tab with `{ to: id }`. */
  fire<K extends KeyOf<EventsOf<S>>>(msgClass: K, message: EventsOf<S>[K], audience?: WorkerAudience): void;
  postBox<K extends KeyOf<BoxesOf<S>>>(address: K, handler: (item: BoxItem<BoxesOf<S>, K>) => void): Unsubscribe;
  post<K extends KeyOf<BoxesOf<S>>>(address: K, value: BoxesOf<S>[K]): void;
  closeBox<K extends KeyOf<BoxesOf<S>>>(address: K): void;
  package<K extends KeyOf<PackagesOf<S>>>(address: K, handler: (item: PackageItem<PackagesOf<S>, K>) => void): Unsubscribe;
  pack<K extends KeyOf<PackagesOf<S>>>(address: K, content: PackagesOf<S>[K]): void;
  /** Open a Server-Sent Events stream in the worker (shared by every tab). Returns a function that closes it. */
  subscribe(url: string, onMessage: (event: MessageEvent<string>) => void, onError?: (event: Event) => void): Unsubscribe;
  /** ids of the tabs currently connected. */
  members(): string[];
}

/** What `self.init` receives: the API, also callable for v4 scripts (`PostalWorker().on(…)`). */
export type WorkerScriptApi<S extends Schema = AnySchema> = WorkerApi<S> & (() => WorkerApi<S>);

export type WorkerScriptInit<S extends Schema = AnySchema> = (pw: WorkerScriptApi<S>) => void;

/** Register this script's init function. Call it once at the top level of a worker script. */
export function defineWorkerScript<S extends Schema = AnySchema>(init: WorkerScriptInit<S>): void {
  (globalThis as { init?: unknown }).init = init;
}
