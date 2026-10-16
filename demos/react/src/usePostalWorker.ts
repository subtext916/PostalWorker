/**
 * React hooks for PostalWorker v5.
 * `npm run demo:react` (in the repo root) copies the built library into ./postalworker.
 */
import { useEffect, useRef, useState } from "react";
import {
  createPostalWorker,
  type BoxesOf,
  type EventsOf,
  type KeyOf,
  type MessageMeta,
  type PostalConfig,
  type PostalWorker,
  type Schema,
} from "./postalworker";

// One instance per tab and channel, shared by every component (and safe under StrictMode).
const instances = new Map<string, PostalWorker<never>>();

export function usePostalWorker<S extends Schema>(config: PostalConfig): PostalWorker<S> {
  const key = config.channelName ?? "PostalWorker";
  let postal = instances.get(key) as PostalWorker<S> | undefined;
  if (!postal) {
    postal = createPostalWorker<S>(config);
    instances.set(key, postal as unknown as PostalWorker<never>);
  }
  return postal;
}

/** Subscribe to a message class for the lifetime of the component. */
export function usePostalEvent<S extends Schema, K extends KeyOf<EventsOf<S>>>(
  postal: PostalWorker<S>,
  msgClass: K,
  handler: (message: EventsOf<S>[K], meta: MessageMeta) => void,
): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => postal.on(msgClass, (m, meta) => latest.current(m, meta)), [postal, msgClass]);
}

/** Current value of a shared box (null until something is posted), plus the full box snapshot. */
export function usePostBox<S extends Schema, K extends KeyOf<BoxesOf<S>>>(
  postal: PostalWorker<S>,
  address: K,
): { value: BoxesOf<S>[K] | null; box: Partial<Record<string, unknown>> } {
  const [state, setState] = useState<{ value: BoxesOf<S>[K] | null; box: Partial<Record<string, unknown>> }>({
    value: null,
    box: {},
  });
  useEffect(
    () =>
      postal.postBox(address, (item) => {
        if (!item.closed) setState({ value: item.value, box: item.box as Partial<Record<string, unknown>> });
      }),
    [postal, address],
  );
  return state;
}
