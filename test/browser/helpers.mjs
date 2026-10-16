// Shared helpers for the browser suite: a static server on two origins and Playwright pages.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".map": "application/json", ".txt": "text/plain" };

/** Serves /dist/* and /fixtures/* (from test/browser/fixtures). */
export async function startServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const rel = pathname.startsWith("/fixtures/")
      ? path.join("test/browser", pathname)
      : pathname.startsWith("/dist/")
        ? pathname.slice(1)
        : null;
    if (!rel || rel.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(path.join(root, rel));
      res.writeHead(200, { "content-type": TYPES[path.extname(rel)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  // Same server, two different origins (localhost vs 127.0.0.1).
  return {
    A: `http://localhost:${port}`,
    B: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

export async function launch() {
  return chromium.launch({ args: ["--host-resolver-rules=MAP localhost 127.0.0.1"] });
}

let channelCounter = 0;
/** A fresh channel name per test keeps workers and state isolated. */
export const freshChannel = () => `t${process.pid}-${++channelCounter}`;

/** Open a page and wait until PostalWorker has started. Collects page errors and console warnings. */
export async function openPage(context, url) {
  const page = await context.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") page.problems.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 10_000, polling: 50 });
  return page;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `fn` in a page/frame until it returns truthy, or fail with the last value. */
export async function eventually(target, fn, arg, { timeout = 3000, label = "condition" } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await target.evaluate(fn, arg);
    if (last) return last;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${label}; last value: ${JSON.stringify(last)}`);
}

/** Log entries named `name` in a page or frame. */
export const logOf = (target, name) => target.evaluate((n) => window.log.filter((e) => e.name === n), name);
