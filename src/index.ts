/**
 * PostalWorker v5: typed messaging between tabs, iframes, popups and a SharedWorker.
 *
 *   import { createPostalWorker } from "postalworker-es";   // v5
 *   import PostalWorker from "postalworker-es";             // v4-compatible singleton
 */
export { createPostalWorker, WORKER_ID } from "./core";
export type {
  PostalWorker,
  PostalConfig,
  WorkerMode,
  EventHandler,
  CrossHandler,
  CrossOnOptions,
} from "./core";
export type {
  Schema,
  AnySchema,
  EventMap,
  EventsOf,
  BoxesOf,
  PackagesOf,
  Audience,
  MessageMeta,
  CrossMeta,
  BoxItem,
  PackageItem,
  Unsubscribe,
  KeyOf,
} from "./types";
export type { LegacyPostalWorker, LegacyConfig, LegacyAudience } from "./compat";
export { default } from "./compat";
