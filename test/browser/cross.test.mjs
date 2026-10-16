// Cross-window messaging: cross-origin iframes, popups, origin trust.
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

const pageAt = (origin, extra = "") => `${origin}/fixtures/page.html?channel=${freshChannel()}${extra}`;

/** Parent on origin A with a child iframe on origin B. */
async function parentWithFrame() {
  const parent = await openPage(context, pageAt(server.A));
  const childUrl = pageAt(server.B);
  await parent.evaluate((src) => { document.getElementById("frame").src = src; }, childUrl);
  const frame = await eventually(parent, () => true, null).then(async () => {
    for (let i = 0; i < 100; i++) {
      const f = parent.frames().find((x) => x.url().startsWith(childUrl));
      if (f) return f;
      await sleep(25);
    }
    throw new Error("iframe did not load");
  });
  await frame.waitForFunction(() => window.ready === true, null, { timeout: 8000, polling: 50 }).catch(async (e) => {
    const state = await frame.evaluate(() => ({ ready: window.ready, errors: window.errors, hasPostal: !!window.postal, mode: window.postal?.mode, online: window.postal?.workerOnline })).catch((x) => String(x));
    throw new Error(`child frame never became ready: ${JSON.stringify(state)} / parent problems: ${parent.problems.join(" | ")}`);
  });
  await eventually(parent, () => postal.windows().length === 1, null, { label: "parent registered child" });
  await eventually(frame, () => postal.windows().length === 1, null, { label: "child registered parent" });
  return { parent, frame };
}

test("iframe (cross-origin): handshake registers both sides with exact origins", async () => {
  const { parent, frame } = await parentWithFrame();
  const fromParent = await parent.evaluate(() => postal.windows());
  const fromChild = await frame.evaluate(() => postal.windows());
  assert.equal(fromParent[0].relation, "child");
  assert.equal(fromParent[0].origin, server.B);
  assert.equal(fromChild[0].relation, "parent");
  assert.equal(fromChild[0].origin, server.A);
  assert.equal(await frame.evaluate(() => postal.isFramed), true);
  assert.equal(await parent.evaluate(() => postal.isFramed), false);
});

test("iframe: backFire child -> parent, crossFire both ways", async () => {
  const { parent, frame } = await parentWithFrame();
  await parent.evaluate(() => { postal.crossOn("up", rec("up")); postal.crossOn("up2", rec("up2")); });
  await frame.evaluate(() => postal.crossOn("down", rec("down")));

  await frame.evaluate(() => postal.backFire("up", "via backFire"));
  await frame.evaluate(() => postal.crossFire("up2", "via crossFire"));
  await parent.evaluate(() => postal.crossFire("down", "to child"));

  const up = await eventually(parent, () => window.log.find((e) => e.name === "up"), null, { label: "backFire" });
  assert.equal(up.message, "via backFire");
  await eventually(parent, () => window.log.some((e) => e.name === "up2"), null, { label: "crossFire up" });
  const down = await eventually(frame, () => window.log.find((e) => e.name === "down"), null, { label: "crossFire down" });
  assert.equal(down.from, await parent.evaluate(() => postal.id));
});

test("iframe: crossOn(url) from inside an iframe opens and connects a popup (v4 bug)", async () => {
  const { frame } = await parentWithFrame();
  const popupPromise = context.waitForEvent("page");
  await frame.evaluate((u) => postal.crossOn("from-popup", rec("from-popup"), u, { name: "pop" }), pageAt(server.A));
  const popup = await popupPromise;
  await popup.waitForFunction(() => window.ready === true, null, { polling: 50 });
  await eventually(frame, () => postal.windows().some((w) => w.relation === "opened"), null, { label: "child registered its popup" });
  await popup.evaluate(() => postal.crossFire("from-popup", "hello child"));
  await eventually(frame, () => window.log.some((e) => e.name === "from-popup"), null);
  await popup.close();
});

test("popup: crossOn(url) opens it; messages flow both ways", async () => {
  const opener = await openPage(context, pageAt(server.A));
  const popupPromise = context.waitForEvent("page");
  await opener.evaluate((u) => postal.crossOn("up", rec("up"), u, { name: "p1", features: { popup: true, width: 400, height: 300 } }), pageAt(server.B));
  const popup = await popupPromise;
  await popup.waitForFunction(() => window.ready === true, null, { polling: 50 });
  await eventually(opener, () => postal.windows().length === 1, null, { label: "opener registered popup" });
  assert.equal((await opener.evaluate(() => postal.windows()))[0].relation, "opened");
  assert.equal((await popup.evaluate(() => postal.windows()))[0].relation, "opener");

  await popup.evaluate(() => postal.crossOn("down", rec("down")));
  await popup.evaluate(() => postal.crossFire("up", "from popup"));
  await opener.evaluate(() => postal.crossFire("down", "from opener"));
  await eventually(opener, () => window.log.some((e) => e.name === "up"), null);
  await eventually(popup, () => window.log.some((e) => e.name === "down"), null);

  await opener.evaluate((u) => postal.closeWindows(u), server.B);
  await eventually(opener, () => postal.windows().length === 0, null, { label: "closeWindows forgot it" });
  await eventually(popup, () => true, null).catch(() => {});
  assert.ok(popup.isClosed() || (await popup.evaluate(() => window.closed).catch(() => true)));
});

test("untrusted origins are ignored; allowedOrigins lets them in", async () => {
  // Popup opened with plain window.open (not crossOn), from another origin: not trusted by default.
  const strict = await openPage(context, pageAt(server.A));
  await strict.evaluate(() => postal.crossOn("knock", rec("knock")));
  let popupPromise = context.waitForEvent("page");
  await strict.evaluate((u) => { window.open(u, "stranger"); }, pageAt(server.B));
  let stranger = await popupPromise;
  await stranger.waitForFunction(() => window.ready === true, null, { polling: 50 });
  await stranger.evaluate(() => postal.crossFire("knock", "let me in"));
  await sleep(400);
  assert.equal((await logOf(strict, "knock")).length, 0);
  assert.ok(strict.problems.some((p) => p.includes("untrusted origin")), "a warning explains why");
  await stranger.close();

  const open = await openPage(context, pageAt(server.A, `&allow=${encodeURIComponent(server.B)}`));
  await open.evaluate(() => postal.crossOn("knock", rec("knock")));
  popupPromise = context.waitForEvent("page");
  await open.evaluate((u) => { window.open(u, "friend"); }, pageAt(server.B));
  stranger = await popupPromise;
  await stranger.waitForFunction(() => window.ready === true, null, { polling: 50 });
  await eventually(stranger, () => postal.windows().length === 1, null, { label: "friend handshake" });
  await stranger.evaluate(() => postal.crossFire("knock", "hello"));
  await eventually(open, () => window.log.some((e) => e.name === "knock"), null, { label: "allowed origin accepted" });
  await stranger.close();
});

test("crossOff and backFire outside an iframe", async () => {
  const { parent, frame } = await parentWithFrame();
  await parent.evaluate(() => postal.crossOn("x", rec("x")));
  await parent.evaluate(() => postal.crossOff("x"));
  await frame.evaluate(() => postal.backFire("x", 1));
  await sleep(250);
  assert.equal((await logOf(parent, "x")).length, 0);
  await parent.evaluate(() => postal.backFire("x", 1));
  assert.ok(parent.problems.some((p) => p.includes("only works inside an iframe")));
});

test("fireAll reaches tabs and connected windows", async () => {
  const { parent, frame } = await parentWithFrame();
  const sibling = await openPage(context, parent.url());
  await sibling.evaluate(() => postal.on("all", rec("tab")));
  await frame.evaluate(() => postal.crossOn("all", rec("frame")));
  await parent.evaluate(() => { postal.on("all", rec("self")); postal.fireAll("all", "everyone"); });
  await eventually(parent, () => window.log.some((e) => e.name === "self"), null);
  await eventually(sibling, () => window.log.some((e) => e.name === "tab"), null);
  await eventually(frame, () => window.log.some((e) => e.name === "frame"), null);
});
