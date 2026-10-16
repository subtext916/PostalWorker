/**
 * Minimal handler registry: any number of handlers per key.
 * Shared by the window library and the worker. A throwing handler is
 * reported but never stops the other handlers.
 */
export type AnyHandler = (...args: never[]) => void;

export class Registry<H extends AnyHandler> {
  readonly #handlers = new Map<string, Set<H>>();

  add(key: string, handler: H): () => void {
    let set = this.#handlers.get(key);
    if (!set) {
      set = new Set();
      this.#handlers.set(key, set);
    }
    set.add(handler);
    return () => this.remove(key, handler);
  }

  remove(key: string, handler?: H): void {
    if (!handler) {
      this.#handlers.delete(key);
      return;
    }
    const set = this.#handlers.get(key);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.#handlers.delete(key);
  }

  has(key: string): boolean {
    return this.#handlers.has(key);
  }

  keys(): string[] {
    return [...this.#handlers.keys()];
  }

  clear(): void {
    this.#handlers.clear();
  }

  emit(key: string, ...args: Parameters<H>): void {
    const set = this.#handlers.get(key);
    if (!set) return;
    // copy so handlers may unsubscribe while we iterate
    for (const handler of [...set]) {
      try {
        (handler as (...a: Parameters<H>) => void)(...args);
      } catch (error) {
        reportHandlerError(key, error);
      }
    }
  }
}

function reportHandlerError(key: string, error: unknown): void {
  // Surface the error without breaking delivery to other handlers.
  queueMicrotask(() => {
    throw error instanceof Error
      ? Object.assign(error, { message: `PostalWorker handler for "${key}" threw: ${error.message}` })
      : error;
  });
}
