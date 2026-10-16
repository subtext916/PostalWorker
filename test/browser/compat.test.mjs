// v4 compatibility: PostalWorker() singleton, v4 names and return values, script-tag build.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openPage, freshChannel, eventually, sleep } from "./helpers.mjs";

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

async function twoTabs(file = "compat.html") {
  const url = `${server.A}/fixtures/${file}?channel=${freshChannel()}`;
  return { a: await openPage(context, url), b: await openPage(context, url) };
}

test("compat: PostalWorker() is a singleton and comes online", async () => {
  const { a } = await twoTabs();
  assert.equal(await a.evaluate(() => PW === PW2), true);
  assert.equal(await a.evaluate(() => window.online), true);
  assert.equal(await a.evaluate(() => PW.sharedWorkerSupported), true);
  assert.equal(await a.evaluate(() => typeof PW.id), "string");
});

test("compat: on() chains, fire() returns true and reaches everyone; 'PUBLIC' skips the sender", async () => {
  const { a, b } = await twoTabs();
  for (const p of [a, b]) await p.evaluate(() => PW.on("ex", (m) => log.push(m)).on("ex2", (m) => log.push(m)));
  assert.equal(await a.evaluate(() => PW.fire("ex", "to all")), true);
  await a.evaluate(() => PW.fire("ex2", "public", "PUBLIC"));
  await eventually(b, () => log.length === 2, null);
  await sleep(150);
  assert.deepEqual(await a.evaluate(() => log), ["to all"]);
  assert.deepEqual((await b.evaluate(() => log)).sort(), ["public", "to all"]);
  assert.equal(await a.evaluate(() => PW.un("ex")), true);
});

test("compat: postBox / post / closeBox with v4 callback shape", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => PW.postBox("count", (item) => log.push(item)));
  await b.evaluate(() => PW.post("count", 7));
  const item = await eventually(a, () => log.find((i) => i.value === 7), null);
  assert.deepEqual(Object.keys(item).sort(), ["address", "box", "value"]);
  assert.deepEqual(item.box, { count: 7 });
  await a.evaluate(() => PW.closeBox("count"));
  await eventually(a, () => log.at(-1).value === null, null, { label: "final null" });
});

test("compat: pack(address, url) delivers a data: URL like v4", async () => {
  const { a, b } = await twoTabs();
  await a.evaluate(() => PW.package("file", (item) => log.push(item)));
  await b.evaluate(() => PW.pack("file", "/fixtures/file.txt"));
  const got = await eventually(a, () => log.find((i) => typeof i.content === "string"), null, { label: "data url" });
  assert.match(got.content, /^data:text\/plain;base64,/);
  assert.equal(Buffer.from(got.content.split(",")[1], "base64").toString(), "hello-package");
});

test("compat: v4 worker scripts load and answer", async () => {
  const { a } = await twoTabs();
  await a.evaluate(() => { PW.on("v4pong", (m) => log.push(m)); PW.load("/fixtures/worker-v4.js"); });
  await sleep(150);
  await a.evaluate(() => PW.fire("v4ping"));
  await eventually(a, () => log.includes("hi from a v4 script"), null);
});

test("compat: crossOn with v4 arguments opens and connects a popup; unCross closes it", async () => {
  const { a } = await twoTabs();
  const popupPromise = context.waitForEvent("page");
  await a.evaluate((u) => PW.crossOn("pop", (m) => log.push(m), u, "PopupName", { width: 300, height: 200 }), `${server.B}/fixtures/compat.html?channel=${freshChannel()}`);
  const popup = await popupPromise;
  await popup.waitForFunction(() => window.ready === true, null, { polling: 50 });
  await eventually(a, () => PW.v5.windows().length === 1, null);
  await popup.evaluate(() => PW.crossFire("pop", "from popup"));
  await eventually(a, () => log.includes("from popup"), null);
  await a.evaluate((u) => PW.unCross("pop", u), server.B);
  await eventually(a, () => PW.v5.windows().length === 0, null);
});

test("compat: script-tag build sets window.PostalWorker and finds the worker next to the script", async () => {
  const { a, b } = await twoTabs("script-tag.html");
  assert.equal(await a.evaluate(() => window.online), true, "PostalSharedWorker.js found via the script's folder");
  assert.equal(await a.evaluate(() => typeof window.createPostalWorker), "function");
  await b.evaluate(() => PW.on("tag", (m) => log.push(m)));
  await a.evaluate(() => PW.fire("tag", "from a script tag"));
  await eventually(b, () => log.length === 1, null);
});
