// Tabs + SharedWorker: events, audiences, post boxes, packages, worker scripts.
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

async function twoTabs(query = "") {
  const channel = freshChannel();
  const url = `${server.A}/fixtures/page.html?channel=${channel}${query}`;
  const a = await openPage(context, url);
  const b = await openPage(context, url);
  return { a, b, channel, url };
}

test("worker comes online in SharedWorker mode", async () => {
  const { a, b } = await twoTabs();
  assert.equal(await a.evaluate(() => window.online), true);
  assert.equal(await a.evaluate(() => postal.mode), "shared");
  assert.equal(await b.evaluate(() => postal.workerOnline), true);
  assert.notEqual(await a.evaluate(() => postal.id), await b.evaluate(() => postal.id));
});

test("fire() default audience reaches the sender, other tabs and the worker", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.load("/fixtures/worker-echo.js"));
  for (const p of [a, b]) await p.evaluate(() => {
    postal.on("greet", rec("greet"));
    postal.on("worker-saw", rec("worker-saw"));
  });
  await sleep(100);
  await a.evaluate(() => postal.fire("greet", "hi"));
  await a.evaluate(() => postal.fire("worker-only", "for the worker"));
  await eventually(a, () => window.log.some((e) => e.name === "greet"), null, { label: "sender gets its own message" });
  await eventually(b, () => window.log.some((e) => e.name === "greet"), null, { label: "other tab gets it" });
  const saw = await eventually(b, () => window.log.find((e) => e.name === "worker-saw"), null, { label: "worker got it" });
  assert.equal(saw.message.m, "for the worker");
  assert.equal(saw.from, "worker");
  const aId = await a.evaluate(() => postal.id);
  assert.equal((await logOf(a, "greet"))[0].from, aId);
  assert.equal((await logOf(b, "greet"))[0].from, aId);
});

test("audiences: others, local, worker, and one tab by id", async () => {
  const { a, b } = await twoTabs();
  const c = await openPage(context, a.url());
  await a.evaluate(() => postal.load("/fixtures/worker-echo.js"));
  for (const p of [a, b, c]) await p.evaluate(() => {
    postal.on("x", rec("x"));
    postal.on("worker-saw", rec("worker-saw"));
  });
  await sleep(100);
  const bId = await b.evaluate(() => postal.id);

  await a.evaluate(() => postal.fire("x", "others", "others"));
  await a.evaluate(() => postal.fire("x", "local", "local"));
  await a.evaluate((to) => postal.fire("x", "direct", { to }), bId);
  await a.evaluate(() => postal.fire("worker-only", "w", "worker"));
  await eventually(c, () => window.log.some((e) => e.name === "worker-saw"), null, { label: "worker audience" });
  await sleep(200);

  const msgs = async (p) => (await logOf(p, "x")).map((e) => e.message).sort();
  assert.deepEqual(await msgs(a), ["local"]);
  assert.deepEqual(await msgs(b), ["direct", "others"]);
  assert.deepEqual(await msgs(c), ["others"]);
});

test("worker fire() 'worker' audience never reaches tabs", async () => {
  const { a, b } = await twoTabs();
  await b.evaluate(() => postal.on("worker-only", rec("leak")));
  await a.evaluate(() => postal.fire("worker-only", 1, "worker"));
  await sleep(250);
  assert.equal((await logOf(b, "leak")).length, 0);
});

test("several handlers per message class; unsubscribe and off()", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => {
    window.offFirst = postal.on("dup", rec("first"));
    postal.on("dup", rec("second"));
  });
  await b.evaluate(() => postal.fire("dup", 1));
  await eventually(a, () => window.log.length === 2, null, { label: "both handlers" });
  await a.evaluate(() => window.offFirst());
  await b.evaluate(() => postal.fire("dup", 2));
  await eventually(a, () => window.log.length === 3, null);
  assert.deepEqual((await a.evaluate(() => window.log.map((e) => e.name))), ["first", "second", "second"]);
  await a.evaluate(() => postal.off("dup"));
  await b.evaluate(() => postal.fire("dup", 3));
  await sleep(200);
  assert.equal(await a.evaluate(() => window.log.length), 3);
});

test("a throwing handler does not stop other handlers", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => {
    postal.on("boom", () => { throw new Error("handler exploded"); });
    postal.on("boom", rec("after"));
  });
  await b.evaluate(() => postal.fire("boom", 1));
  await eventually(a, () => window.log.some((e) => e.name === "after"), null, { label: "second handler ran" });
  assert.ok(a.problems.some((p) => p.includes("handler exploded")), "error is still reported");
});

test("postBox: initial value, updates, late subscribers, no duplicates", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.postBox("count", (item) => window.log.push({ name: "box", message: item })));
  await eventually(a, () => window.log.length === 1, null, { label: "initial callback" });
  assert.equal((await logOf(a, "box"))[0].message.value, null);

  await b.evaluate(() => postal.post("count", 5));
  await eventually(a, () => window.log.length === 2, null, { label: "update" });
  const update = (await logOf(a, "box"))[1].message;
  assert.equal(update.value, 5);
  assert.deepEqual(update.box, { count: 5 });
  assert.equal(update.closed, false);

  await b.evaluate(() => postal.postBox("count", (item) => window.log.push({ name: "box", message: item })));
  const late = await eventually(b, () => window.log.find((e) => e.name === "box"), null, { label: "late subscriber" });
  assert.equal(late.message.value, 5);
  await sleep(200);
  assert.equal((await logOf(a, "box")).length, 2, "tab A is not re-notified when tab B opens the box");
});

test("closeBox: final null callback, then no more updates", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.postBox("c", (item) => window.log.push({ name: "box", message: item })));
  await b.evaluate(() => postal.post("c", 1));
  await eventually(a, () => window.log.length === 2, null);
  await a.evaluate(() => postal.closeBox("c"));
  const last = await eventually(a, () => window.log.find((e) => e.message.closed), null, { label: "final callback" });
  assert.equal(last.message.value, null);
  await b.evaluate(() => postal.post("c", 2));
  await sleep(250);
  assert.ok(!(await logOf(a, "box")).some((e) => e.message.value === 2));
});

test("postBox() returns a close function; a second handler in the same tab gets the current value", async () => {
  const { a, b } = await twoTabs();
  await b.evaluate(() => postal.post("v", "first"));
  await a.evaluate(() => { window.close1 = postal.postBox("v", (i) => window.log.push({ name: "h1", message: i })); });
  await eventually(a, () => window.log.some((e) => e.name === "h1" && e.message.value === "first"), null, { label: "value posted before open" });
  await a.evaluate(() => postal.postBox("v", (i) => window.log.push({ name: "h2", message: i })));
  await eventually(a, () => window.log.some((e) => e.name === "h2" && e.message.value === "first"), null, { label: "second handler" });
  await a.evaluate(() => window.close1());
  await b.evaluate(() => postal.post("v", "second"));
  await eventually(a, () => window.log.some((e) => e.name === "h2" && e.message.value === "second"), null);
  assert.ok(!(await logOf(a, "h1")).some((e) => e.message.value === "second"), "closed handler stays quiet");
});

test("packages carry any cloneable content, including Blobs", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.package("pkg", (item) => window.log.push({ name: "pkg", message: item })));
  await eventually(a, () => window.log.length === 1, null);
  await b.evaluate(() => postal.pack("pkg", new Blob(["hello-blob"], { type: "text/plain" })));
  const text = await eventually(a, async () => {
    const e = window.log.find((x) => x.message.content instanceof Blob);
    return e ? await e.message.content.text() : undefined;
  }, null, { label: "blob delivered" });
  assert.equal(text, "hello-blob");
});

test("load(): worker script replies to one tab with { to: from }", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.load("/fixtures/worker-echo.js"));
  for (const p of [a, b]) await p.evaluate(() => postal.on("pong", rec("pong")));
  await sleep(100);
  await a.evaluate(() => postal.fire("ping", 41));
  const pong = await eventually(a, () => window.log.find((e) => e.name === "pong"), null, { label: "pong" });
  assert.equal(pong.message.n, 42);
  assert.equal(pong.from, "worker");
  await sleep(200);
  assert.equal((await logOf(b, "pong")).length, 0, "reply went only to the asking tab");
});

test("load(): worker-side postBox and members()", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.load("/fixtures/worker-echo.js"));
  await b.evaluate(() => postal.postBox("out", (i) => window.log.push({ name: "out", message: i })));
  await sleep(100);
  await a.evaluate(() => postal.post("in", "tab A"));
  await eventually(b, () => window.log.some((e) => e.message.value === "worker saw tab A"), null, { label: "worker posted back" });
  await a.evaluate(() => { postal.on("members", rec("members")); postal.fire("who", null); });
  const members = await eventually(a, () => window.log.find((e) => e.name === "members"), null);
  const ids = await Promise.all([a, b].map((p) => p.evaluate(() => postal.id)));
  for (const id of ids) assert.ok(members.message.includes(id));
});

test("load(): v4 scripts that call PostalWorker().on still work, and a script loads once", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.load("/fixtures/worker-v4.js"));
  await b.evaluate(() => postal.load("/fixtures/worker-v4.js"));
  await a.evaluate(() => postal.on("v4pong", rec("v4pong")));
  await sleep(150);
  await a.evaluate(() => postal.fire("v4ping", null));
  await eventually(a, () => window.log.some((e) => e.name === "v4pong"), null, { label: "v4 script answered" });
  await sleep(200);
  assert.equal((await logOf(a, "v4pong")).length, 1, "loaded only once");
});

test("load(): a broken script reports an error to the tab that loaded it", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.load("/fixtures/worker-broken.js"));
  await eventually(a, () => window.errors.some((e) => e.includes("did not define self.init")), null, { label: "error reported" });
  await a.evaluate(() => postal.load("/fixtures/does-not-exist.js"));
  await eventually(a, () => window.errors.some((e) => e.includes("does-not-exist.js")), null, { label: "404 reported" });
  assert.equal((await b.evaluate(() => window.errors)).length, 0, "other tabs are not bothered");
});

test("foreign postMessage traffic is ignored silently", async () => {
  const { a } = await twoTabs();
  const before = a.problems.length;
  await a.evaluate(() => {
    window.postMessage({ some: "object" }, "*");
    window.postMessage("not json", "*");
    window.postMessage(JSON.stringify({ postal: true, type: "FIRE" }), "*");
    window.postMessage({ __postal: 5, kind: "cross" }, "*"); // malformed: no from
  });
  await sleep(250);
  assert.deepEqual(a.problems.slice(before), []);
  assert.deepEqual(await a.evaluate(() => window.errors), []);
});

test("messages sent before the worker answers are queued, not lost", async () => {
  const channel = freshChannel();
  const b = await openPage(context, `${server.A}/fixtures/page.html?channel=${channel}`);
  await b.evaluate(() => postal.postBox("early", (i) => window.log.push({ name: "early", message: i })));
  const a = await context.newPage();
  await a.addInitScript(() => {
    // post as soon as the instance exists, before ready() resolves
    const id = setInterval(() => { if (window.postal) { clearInterval(id); window.postal.post("early", "queued"); } }, 0);
  });
  await a.goto(`${server.A}/fixtures/page.html?channel=${channel}`);
  await eventually(b, () => window.log.some((e) => e.message.value === "queued"), null, { label: "queued post delivered" });
});

test("workerUrl that 404s: onError, ready() false, tabs still talk", async () => {
  const { a, b } = await twoTabs("&worker=/dist/missing.js&timeout=1500");
  assert.equal(await a.evaluate(() => window.online), false);
  assert.ok((await a.evaluate(() => window.errors)).some((e) => /SharedWorker|did not answer/.test(e)));
  await b.evaluate(() => postal.on("still", rec("still")));
  await a.evaluate(() => postal.fire("still", "works"));
  await eventually(b, () => window.log.some((e) => e.name === "still"), null, { label: "tab to tab without worker" });
});

test("workerUrl: false runs without a worker; box APIs report instead of hanging", async () => {
  const { a, b } = await twoTabs("&worker=none");
  assert.equal(await a.evaluate(() => postal.mode), "none");
  await b.evaluate(() => postal.on("w", rec("w")));
  await a.evaluate(() => postal.fire("w", 1));
  await eventually(b, () => window.log.length === 1, null);
  await a.evaluate(() => postal.post("x", 1));
  assert.ok((await a.evaluate(() => window.errors)).some((e) => e.includes("needs the worker")));
});

test("different channel names are isolated", async () => {
  const a = await openPage(context, `${server.A}/fixtures/page.html?channel=${freshChannel()}`);
  const b = await openPage(context, `${server.A}/fixtures/page.html?channel=${freshChannel()}`);
  await b.evaluate(() => postal.on("iso", rec("iso")));
  await a.evaluate(() => postal.fire("iso", 1));
  await sleep(200);
  assert.equal((await logOf(b, "iso")).length, 0);
});

test("destroy() leaves the network", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => postal.load("/fixtures/worker-echo.js"));
  await b.evaluate(() => postal.on("x", rec("x")));
  await sleep(100);
  await b.evaluate(() => postal.destroy());
  await a.evaluate(() => postal.fire("x", 1));
  await a.evaluate(() => { postal.on("members", rec("members")); postal.fire("who", null); });
  const members = await eventually(a, () => window.log.find((e) => e.name === "members"), null);
  assert.equal(members.message.length, 1, "only tab A is still a member");
  assert.equal((await logOf(b, "x")).length, 0);
});
