import { test } from "node:test";
import assert from "node:assert/strict";
import { Registry } from "../../src/emitter.ts";

test("several handlers per key, unsubscribe one, remove all", () => {
  const r = new Registry<(n: number) => void>();
  const seen: string[] = [];
  const off = r.add("k", (n) => seen.push(`a${n}`));
  r.add("k", (n) => seen.push(`b${n}`));
  r.emit("k", 1);
  off();
  r.emit("k", 2);
  r.remove("k");
  r.emit("k", 3);
  assert.deepEqual(seen, ["a1", "b1", "b2"]);
  assert.equal(r.has("k"), false);
});

test("a handler may unsubscribe itself during emit", () => {
  const r = new Registry<() => void>();
  let calls = 0;
  const off = r.add("k", () => { calls++; off(); });
  r.add("k", () => calls++);
  r.emit("k");
  r.emit("k");
  assert.equal(calls, 3);
});

test("a throwing handler does not stop the others, and the error still surfaces", () => {
  const r = new Registry<() => void>();
  let second = false;
  r.add("k", () => { throw new Error("boom"); });
  r.add("k", () => { second = true; });
  // capture the rethrow that would otherwise land as an uncaught error
  const original = globalThis.queueMicrotask;
  let rethrown: unknown;
  globalThis.queueMicrotask = (fn) => { try { fn(); } catch (e) { rethrown = e; } };
  try {
    r.emit("k");
  } finally {
    globalThis.queueMicrotask = original;
  }
  assert.equal(second, true);
  assert.match(String((rethrown as Error).message), /handler for "k" threw: boom/);
});
