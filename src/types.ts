/**
 * Public schema types shared by the window library and worker scripts.
 * This file must stay free of DOM- or worker-only types.
 */

/** Map of message class name → message payload type. */
export type EventMap = Record<string, unknown>;

/**
 * Describes everything that travels over PostalWorker for one application.
 *
 * ```ts
 * type AppSchema = {
 *   events: { "cart:updated": { items: number }; ping: number };
 *   boxes: { volume: number };
 *   packages: { avatar: Blob };
 * };
 * const postal = createPostalWorker<AppSchema>({ workerUrl: "/PostalSharedWorker.js" });
 * ```
 *
 * Every key is optional; anything left out falls back to `Record<string, unknown>`.
 */
export interface Schema {
  events?: EventMap;
  boxes?: EventMap;
  packages?: EventMap;
}

/** Untyped schema used when no type argument is given. */
export interface AnySchema {
  events: Record<string, unknown>;
  boxes: Record<string, unknown>;
  packages: Record<string, unknown>;
}

export type EventsOf<S extends Schema> = S["events"] extends EventMap
  ? S["events"]
  : Record<string, unknown>;
export type BoxesOf<S extends Schema> = S["boxes"] extends EventMap
  ? S["boxes"]
  : Record<string, unknown>;
export type PackagesOf<S extends Schema> = S["packages"] extends EventMap
  ? S["packages"]
  : Record<string, unknown>;

/** String keys of a map (message class names, box addresses, package addresses). */
export type KeyOf<M> = Extract<keyof M, string>;

/**
 * Who receives a `fire()`.
 * - `"all"` (default): this tab, every other tab and the worker
 * - `"others"`: every other tab and the worker, not this tab
 * - `"local"`: this tab only (never leaves the tab)
 * - `"worker"`: the worker only
 * - `{ to: id }`: one specific tab, by its `postal.id`
 */
export type Audience = "all" | "others" | "local" | "worker" | { to: string };

/** Extra information passed to event handlers. */
export interface MessageMeta {
  /** id of the sender (`postal.id` of a tab, or `"worker"`) */
  from: string;
}

/** Extra information passed to cross-window handlers. */
export interface CrossMeta extends MessageMeta {
  /** origin of the sending window */
  origin: string;
}

/** What a postBox callback receives. */
export interface BoxItem<Boxes, K extends keyof Boxes = keyof Boxes> {
  address: K;
  /** current value; `null` before the first post and in the final callback after `closeBox` */
  value: Boxes[K] | null;
  /** snapshot of every open box's value, keyed by address */
  box: Partial<{ [P in keyof Boxes]: Boxes[P] | null }>;
  /** true only in the final callback after this tab closed the box */
  closed: boolean;
}

/** What a package callback receives. */
export interface PackageItem<Packages, K extends keyof Packages = keyof Packages> {
  address: K;
  /** latest packed content, or `null` if nothing has been packed yet */
  content: Packages[K] | null;
}

/** Removes the handler or subscription it was returned from. */
export type Unsubscribe = () => void;
