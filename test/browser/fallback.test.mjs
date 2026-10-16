// No SharedWorker: one tab is elected (Web Locks) to host a dedicated Worker for everyone.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openPage, freshChannel, eventually, logOf, sleep } from "./helpers.mjs";

let server, browser, context;
before(async () => {
  server = await startServer();
  browser = await launch();
  context = await browser.newContext();
});
after(async () => {
  await context?.close();
  await browser?.close();
  await server?.close();
});

const url = (channel) => `${server.A}/fixtures/page.html?nosw=1&channel=${channel}`;

test("fallback: dedicated mode comes online in every tab", async () => {
  const channel = freshChannel();
  const tabs = [await openPage(context, url(channel)), await openPage(context, url(channel))];
  for (const t of tabs) {
    assert.equal(await t.evaluate(() => postal.mode), "dedicated");
    assert.equal(await t.evaluate(() => window.online), true);
  }
});

test("fallback: state is shared and nothing is delivered twice (3 tabs)", async () => {
  const channel = freshChannel();
  const [a, b, c] = [await openPage(context, url(channel)), await openPage(context, url(channel)), await openPage(context, url(channel))];
  await a.evaluate(() => postal.postBox("n", (i) => window.log.push({ name: "box", message: i })));
  await eventually(a, () => window.log.length === 1, null);
  await b.evaluate(() => postal.post("n", 1));
  await c.evaluate(() => postal.post("n", 2));
  await eventually(a, () => window.log.some((e) => e.message.value === 2), null);
  await sleep(300);
  assert.deepEqual((await logOf(a, "box")).map((e) => e.message.value), [null, 1, 2]);

  await a.evaluate(() => postal.load("/fixtures/worker-echo.js"));
  await a.evaluate(() => postal.on("pong", rec("pong")));
  await sleep(150);
  await a.evaluate(() => postal.fire("ping", 1));
  await eventually(a, () => window.log.some((e) => e.name === "pong"), null);
  await sleep(300);
  assert.equal((await logOf(a, "pong")).length, 1, "exactly one worker answered");
});

test("fallback: when the hosting tab closes, another takes over and box values survive", async () => {
  const channel = freshChannel();
  const leader = await openPage(context, url(channel));
  const b = await openPage(context, url(channel));
  await b.evaluate(() => postal.postBox("kept", (i) => window.log.push({ name: "box", message: i })));
  await leader.evaluate(() => postal.post("kept", "survives handover"));
  await eventually(b, () => window.log.some((e) => e.message.value === "survives handover"), null);
  const beforeLog = (await logOf(b, "box")).length;

  await leader.close({ runBeforeUnload: true });
  await sleep(500); // b acquires the lock and starts a new worker, then re-seeds it

  const c = await openPage(context, url(channel));
  await c.evaluate(() => postal.postBox("kept", (i) => window.log.push({ name: "box", message: i })));
  const got = await eventually(c, () => window.log.find((e) => e.name === "box"), null, { label: "late tab after handover" });
  assert.equal(got.message.value, "survives handover");

  // and the network still works end to end
  await c.evaluate(() => postal.post("kept", "after"));
  await eventually(b, () => window.log.some((e) => e.message.value === "after"), null);
  assert.ok((await logOf(b, "box")).length > beforeLog);
});

test("fallback: fallback 'none' runs without a worker", async () => {
  // simulated with workerUrl:false, which takes the same path
  const channel = freshChannel();
  const a = await openPage(context, `${url(channel)}&worker=none`);
  assert.equal(await a.evaluate(() => postal.mode), "none");
  assert.equal(await a.evaluate(() => window.online), false);
});
