# Changelog

## 5.0.0

A rewrite in strict TypeScript. The v4 API is still available as the default export; see "Migrating from v4".

### New

- `createPostalWorker<Schema>(config)`: typed message classes, payloads, post boxes and packages.
- `fire()` audiences: `"all"` (default), `"others"`, `"local"`, `"worker"`, `{ to: id }`. This restores the v4-era `ALL` / `PUBLIC` / `PRIVATE` idea, which the BroadcastChannel transport had dropped.
- `on()`, `crossOn()`, `postBox()` and `package()` return unsubscribe functions; `off()` and `crossOff()` remove handlers.
- Handlers receive a second argument with the sender's id (and origin for cross-window messages).
- `postal.ready()`, `postal.mode`, `postal.windows()`, `postal.closeWindows()`, `postal.destroy()`.
- `onError` config: worker errors (such as a failed `load()`) reach the tab that caused them.
- Packages carry any structured-cloneable content (Blob, ArrayBuffer…), not only data: URLs.
- `postalworker-es/worker-script`: `defineWorkerScript<Schema>()` and the `WorkerApi` type for worker scripts. Worker scripts also get `members()`.
- `allowedOrigins` config for cross-window messaging.
- Safe to import during server-side rendering.
- One worker file, `PostalSharedWorker.js`, for both the SharedWorker and the fallback.

### Fixed

- `fire()` now reaches handlers in the sending tab (BroadcastChannel never delivers to its sender).
- Several `on()` handlers per message class. v4 kept only the last one, so subscribing to an internal class (`CONNECT`, `COLLECT`, …) silently broke the library.
- Non-PostalWorker `postMessage` traffic (devtools, extensions, payment widgets…) is ignored; v4 threw from `JSON.parse`.
- `crossOn()` works inside iframes (v4's parent-window check was inverted).
- Without SharedWorker, every tab used to start its own worker: state was not shared and each message was handled once per tab. Now one tab hosts the worker (Web Locks), and when it closes another takes over and tabs re-seed open boxes, packages and loaded scripts.
- Opening a box no longer re-notifies every other tab that has it open.
- Cross-window messages are no longer sent to `"*"`; incoming ones are checked against trusted origins.
- Script-tag route detection no longer matches inline scripts.
- `package.json` points at files that exist and ships type declarations; demo-server packages are no longer installed with the library.

### Removed

- The `Deprecated` port-based messaging path and `safe-json-stringify` (messages are structured-cloned, not JSON strings).
- `PolyfillSharedWorker.js` (use `PostalSharedWorker.js`).
- The rollup/babel/mocha toolchain, replaced by esbuild, tsc and Playwright browser tests.

### Migrating from v4

Existing code keeps working with the default export:

```ts
import PostalWorker from "postalworker-es";
PostalWorker({ PostalRoute: "/js/" }).on("x", (m) => {});
```

Behavior differences to check:

| v4 | v5 |
|---|---|
| `fire()` skipped the sending tab | reaches it; use `fire(c, m, "PUBLIC")` (v4 API) or `"others"` (v5) to skip it |
| `on()` replaced the previous handler for a class | adds a handler; call `un(c)` first to replace |
| any origin could send cross-window messages | v4 API: still any origin unless you pass `allowedOrigins`; v5 API: trusted origins only |
| worker-side `pack(address, url)` fetched the url | worker-side `pack(address, content)` takes the content; fetch it yourself (the window-side v4 `pack(address, url)` still fetches) |
| `PolyfillSharedWorker.js` | not needed; `PostalSharedWorker.js` serves both modes |

Moving a call site to v5:

```ts
// v4
PostalWorker().on("cart", (m) => render(m));
PostalWorker().fire("cart", { items: 3 });

// v5
const postal = createPostalWorker<{ events: { cart: { items: number } } }>({ workerUrl: "/js/PostalSharedWorker.js" });
const off = postal.on("cart", (m) => render(m));
postal.fire("cart", { items: 3 });
```

Both can run in the same tab during a migration: `PostalWorker().v5` is a v5 instance on the same channel.
