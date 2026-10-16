import { test } from "node:test";
import assert from "node:assert/strict";
import { envelope, isChannelMsg, isCrossWindowMsg, reachesTab, reachesWorker, WORKER_ID } from "../../src/protocol.ts";
import { windowFeatures } from "../../src/cross.ts";

test("envelope tags messages and guards recognise them", () => {
  const msg = envelope("tab-1", { kind: "fire", msgClass: "x", message: 1, audience: "all" });
  assert.equal(msg.__postal, 5);
  assert.equal(msg.from, "tab-1");
  assert.ok(isChannelMsg(msg));
  assert.ok(!isCrossWindowMsg(msg));
  assert.ok(isCrossWindowMsg(envelope("tab-1", { kind: "cross-hello" })));
});

test("guards reject foreign and malformed data", () => {
  for (const bad of [null, undefined, "string", 42, {}, { postal: true, type: "FIRE" }, { __postal: 4, from: "a", kind: "fire" }, { __postal: 5, kind: "fire" }, { __postal: 5, from: "a", kind: "nope" }]) {
    assert.equal(isChannelMsg(bad), false, JSON.stringify(bad));
    assert.equal(isCrossWindowMsg(bad), false, JSON.stringify(bad));
  }
});

test("audience routing", () => {
  assert.ok(reachesTab("all", "me") && reachesTab("others", "me"));
  assert.ok(!reachesTab("worker", "me"));
  assert.ok(reachesTab({ to: "me" }, "me") && !reachesTab({ to: "you" }, "me"));
  assert.ok(reachesWorker("all") && reachesWorker("others") && reachesWorker("worker"));
  assert.ok(reachesWorker({ to: WORKER_ID }) && !reachesWorker({ to: "me" }));
});

test("windowFeatures formats objects for window.open", () => {
  assert.equal(windowFeatures(undefined), "");
  assert.equal(windowFeatures("width=1"), "width=1");
  assert.equal(windowFeatures({ popup: true, width: 400, scrollbars: false }), "popup=yes,width=400,scrollbars=no");
});
