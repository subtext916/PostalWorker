import { test } from "node:test";
import assert from "node:assert/strict";
import { createPostalWorker } from "../../src/index.ts";
import PostalWorker from "../../src/index.ts";

test("importing and creating on a server (no window) is inert, not a crash", async () => {
  assert.equal(typeof (globalThis as { window?: unknown }).window, "undefined");
  const postal = createPostalWorker({ workerUrl: "/PostalSharedWorker.js" });
  assert.equal(postal.mode, "none");
  assert.equal(postal.workerOnline, false);
  assert.equal(await postal.ready(), false);
  // nothing throws
  postal.fire("x", 1);
  postal.post("a", 1);
  postal.crossFire("x", 1);
  postal.load("/x.js");
  postal.destroy();
});

test("local delivery still works server-side", async () => {
  const postal = createPostalWorker({ workerUrl: false });
  const got: unknown[] = [];
  postal.on("x", (m) => got.push(m));
  postal.fire("x", "local", "local");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(got, ["local"]);
});

test("v4 PostalWorker() works server-side too", () => {
  const pw = PostalWorker();
  assert.equal(pw, PostalWorker());
  assert.equal(pw.fire("x", 1), true);
});
