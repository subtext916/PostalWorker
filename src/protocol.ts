/**
 * Wire protocol shared by windows and the worker.
 * Messages are plain objects sent with structured clone (no JSON strings),
 * tagged with `__postal` so foreign traffic is ignored.
 * This file must stay free of DOM- or worker-only types.
 */

export const PROTOCOL = 5 as const;

/** id the worker uses as `from` */
export const WORKER_ID = "worker" as const;

/** Audience values that travel over the channel (`"local"` never does). */
export type WireAudience = "all" | "others" | "worker" | { to: string };

interface Base {
  __postal: typeof PROTOCOL;
  from: string;
}

// ---- Channel messages (BroadcastChannel: windows <-> worker <-> windows) ----

export interface FireMsg extends Base {
  kind: "fire";
  msgClass: string;
  message: unknown;
  audience: WireAudience;
}
export interface HelloMsg extends Base {
  kind: "hello";
}
export interface WorkerReadyMsg extends Base {
  kind: "worker-ready";
  /** changes whenever a new worker instance starts (e.g. fallback leader handover) */
  instance: string;
}
export interface JoinMsg extends Base {
  kind: "join";
}
export interface LeaveMsg extends Base {
  kind: "leave";
}
export interface BoxOpenMsg extends Base {
  kind: "box-open";
  address: string;
  /** value to restore if the worker has none (used after a worker restart) */
  seed?: { value: unknown };
}
export interface BoxPostMsg extends Base {
  kind: "box-post";
  address: string;
  value: unknown;
}
export interface BoxCloseMsg extends Base {
  kind: "box-close";
  address: string;
}
export interface BoxUpdateMsg extends Base {
  kind: "box-update";
  address: string;
  value: unknown;
  box: Record<string, unknown>;
  /** when set, only this tab should handle it */
  to?: string;
}
export interface BoxClosedMsg extends Base {
  kind: "box-closed";
  address: string;
  box: Record<string, unknown>;
  to: string;
}
export interface PackageOpenMsg extends Base {
  kind: "package-open";
  address: string;
}
export interface PackagePackMsg extends Base {
  kind: "package-pack";
  address: string;
  content: unknown;
}
export interface PackageUpdateMsg extends Base {
  kind: "package-update";
  address: string;
  content: unknown;
  to?: string;
}
export interface LoadMsg extends Base {
  kind: "load";
  url: string;
}
export interface ErrorMsg extends Base {
  kind: "error";
  message: string;
  to?: string;
}

export type ChannelMsg =
  | FireMsg
  | HelloMsg
  | WorkerReadyMsg
  | JoinMsg
  | LeaveMsg
  | BoxOpenMsg
  | BoxPostMsg
  | BoxCloseMsg
  | BoxUpdateMsg
  | BoxClosedMsg
  | PackageOpenMsg
  | PackagePackMsg
  | PackageUpdateMsg
  | LoadMsg
  | ErrorMsg;

/** Distributive Omit so each union member keeps its own fields. */
export type Body<T> = T extends unknown ? Omit<T, "__postal" | "from"> : never;

// ---- Cross-window messages (window.postMessage: iframes, popups, other origins) ----

export interface CrossHelloMsg extends Base {
  kind: "cross-hello";
}
export interface CrossAckMsg extends Base {
  kind: "cross-ack";
}
export interface CrossProbeMsg extends Base {
  kind: "cross-probe";
}
export interface CrossByeMsg extends Base {
  kind: "cross-bye";
}
export interface CrossMsg extends Base {
  kind: "cross";
  msgClass: string;
  message: unknown;
  /** sent with backFire (child -> parent) */
  back: boolean;
}

export type CrossWindowMsg = CrossHelloMsg | CrossAckMsg | CrossProbeMsg | CrossByeMsg | CrossMsg;

const CHANNEL_KINDS: ReadonlySet<string> = new Set<ChannelMsg["kind"]>([
  "fire",
  "hello",
  "worker-ready",
  "join",
  "leave",
  "box-open",
  "box-post",
  "box-close",
  "box-update",
  "box-closed",
  "package-open",
  "package-pack",
  "package-update",
  "load",
  "error",
]);

const CROSS_KINDS: ReadonlySet<string> = new Set<CrossWindowMsg["kind"]>([
  "cross-hello",
  "cross-ack",
  "cross-probe",
  "cross-bye",
  "cross",
]);

function isEnvelope(data: unknown): data is { __postal: 5; from: string; kind: string } {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return d["__postal"] === PROTOCOL && typeof d["from"] === "string" && typeof d["kind"] === "string";
}

export function isChannelMsg(data: unknown): data is ChannelMsg {
  return isEnvelope(data) && CHANNEL_KINDS.has(data.kind);
}

export function isCrossWindowMsg(data: unknown): data is CrossWindowMsg {
  return isEnvelope(data) && CROSS_KINDS.has(data.kind);
}

export function envelope<T extends ChannelMsg | CrossWindowMsg>(from: string, body: Body<T>): T {
  return { __postal: PROTOCOL, from, ...body } as T;
}

/** Does a channel `fire` with this audience reach the tab `selfId`? (The sender handles itself locally.) */
export function reachesTab(audience: WireAudience, selfId: string): boolean {
  if (audience === "all" || audience === "others") return true;
  if (audience === "worker") return false;
  return audience.to === selfId;
}

/** Does a channel `fire` with this audience reach the worker? */
export function reachesWorker(audience: WireAudience): boolean {
  if (audience === "all" || audience === "others" || audience === "worker") return true;
  return audience.to === WORKER_ID;
}

/** Throw on an exhaustive switch's impossible branch. */
export function assertNever(x: never): never {
  throw new Error(`PostalWorker: unexpected value ${JSON.stringify(x)}`);
}
