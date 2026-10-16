# PostalWorker

Typed messaging between tabs, iframes, popups and a SharedWorker.

- **Tabs** of the same site talk over a `BroadcastChannel`.
- A **SharedWorker** holds shared state (post boxes, packages) and runs scripts you load into it. Where SharedWorker is missing, one tab is elected to host a dedicated Worker for everyone, and another tab takes over when it closes.
- **Iframes, popups and other origins** talk over `window.postMessage`, sent only to exact, trusted origins.
- With a schema type, every message class, payload, box and package is checked by TypeScript.

```sh
npm install postalworker-es
```

Serve `node_modules/postalworker-es/dist/PostalSharedWorker.js` from your site (copy it to your public folder, or import it with your bundler's "asset URL" feature).

## Quick start

```ts
import { createPostalWorker } from "postalworker-es";

type AppSchema = {
  events: { "cart:updated": { items: number }; ping: number };
  boxes: { volume: number };
  packages: { avatar: Blob };
};

export const postal = createPostalWorker<AppSchema>({
  workerUrl: "/PostalSharedWorker.js",
});

// any tab
const off = postal.on("cart:updated", (msg, { from }) => {
  console.log(msg.items, "from", from);
});

// any tab
postal.fire("cart:updated", { items: 3 });   // ✅
postal.fire("cart:updated", { items: "3" }); // ❌ compile error
off();
```

Create one instance per tab and share it.

## Events and audiences

`fire(msgClass, message, audience?)` delivers to:

| audience | this tab | other tabs | worker |
|---|---|---|---|
| `"all"` (default) | ✓ | ✓ | ✓ |
| `"others"` | | ✓ | ✓ |
| `"local"` | ✓ | | |
| `"worker"` | | | ✓ |
| `{ to: id }` | only the tab whose `postal.id` is `id` | | |

`on()` allows any number of handlers per message class and returns an unsubscribe function. `off(msgClass, handler?)` removes one handler, or all of them. A throwing handler never stops the others. Every delivery is asynchronous, so a tab sees its own messages in the same order as everyone else.

## Post boxes: shared values

```ts
const close = postal.postBox("volume", ({ value, box, closed }) => {
  // called with the current value (null if nothing was posted), then on every change
});
postal.post("volume", 11);   // every tab with the box open is updated
postal.closeBox("volume");   // or close(): one last call with value null, closed true
```

Values live in the worker, so a tab opening the box later gets the current value.

## Packages: shared content

```ts
postal.package("avatar", ({ content }) => content && show(URL.createObjectURL(content)));
postal.pack("avatar", await (await fetch("/me.png")).blob());
```

Content can be anything structured-cloneable (Blob, ArrayBuffer, objects…).

## Worker scripts

Load classic scripts into the worker. They run once, however many tabs ask, and share the worker's state.

```ts
postal.load("/workers/echo.js");
```

```ts
// workers/echo.ts — bundle as an IIFE / classic script
import { defineWorkerScript } from "postalworker-es/worker-script";
import type { AppSchema } from "../schema";

defineWorkerScript<AppSchema>((pw) => {
  pw.on("ping", (n, { from }) => pw.fire("ping", n + 1, { to: from }));
  pw.subscribe("/events", (e) => pw.post("volume", Number(e.data))); // Server-Sent Events, shared by all tabs
});
```

Plain JavaScript works too: `self.init = (pw) => { … }`. v4 scripts that call `PostalWorker().on(…)` keep working.

If a script fails to load, the tab that loaded it gets an error (see `onError`).

## Iframes, popups and other origins

```ts
// open a window and listen for its messages
postal.crossOn("chat", (msg, { origin }) => {}, "https://other.example/chat", { features: { popup: true, width: 400 } });

postal.crossFire("chat", "hello");   // to every connected iframe, parent, popup and opener
postal.backFire("chat", "hi parent"); // inside an iframe: to the parent only
postal.fireAll("chat", "everyone");  // fire("all") + crossFire
postal.closeWindows("https://other.example");
postal.windows();                    // [{ id, origin, relation }]
```

The other window must run PostalWorker too. Windows connect with a short handshake, after which messages are sent to each window's exact origin, never `"*"`.

**Trusted by default:** your own origin, your parent (inside an iframe), your opener, iframes in your page (at their `src` origin) and windows you opened with `crossOn(url)` (at that url's origin). Messages from anything else are ignored with a console warning. To accept more, pass `allowedOrigins: ["https://partner.example"]`, or `"*"` to accept any origin.

## Configuration

```ts
createPostalWorker({
  workerUrl: "/PostalSharedWorker.js", // or false to run without a worker
  channelName: "PostalWorker",         // instances with different names are isolated
  fallback: "dedicated",               // or "none" where SharedWorker is missing
  allowedOrigins: [],                  // extra trusted origins, or "*"
  readyTimeout: 5000,                  // ms before queued messages are sent anyway
  onError: (error) => console.error(error),
});
```

Other members: `postal.id`, `postal.mode` (`"shared" | "dedicated" | "none"`), `postal.workerOnline`, `await postal.ready()` (true once the worker answers), `postal.isFramed`, `postal.destroy()`.

Messages sent before the worker answers are queued and sent once it does. Without a worker, events and cross-window messaging still work; post boxes, packages and `load()` report an error.

On the server (SSR) `createPostalWorker` returns an instance that does nothing, so importing it is safe.

## Browser support

Needs `BroadcastChannel`. SharedWorker is used where available (current Chrome, Edge, Firefox, Safari 16+, including mobile). Elsewhere (e.g. Samsung Internet, iOS 15 and older) the dedicated-worker fallback needs Web Locks; without it the library runs without a worker.

## v4 compatibility

```ts
import PostalWorker from "postalworker-es";

PostalWorker({ PostalRoute: "/js/" })   // folder serving PostalSharedWorker.js
  .on("example", (msg) => console.info(msg));
PostalWorker().fire("example", "Hello world");
```

The default export is the v4 API: a singleton with the v4 method names, arguments and return values. `PostalWorker().v5` gives you the v5 instance underneath. For a `<script>` tag, use `dist/PostalWorker.min.js`, which sets `window.PostalWorker` and `window.createPostalWorker`.

See [CHANGELOG.md](CHANGELOG.md) for what changed and how to migrate.

## Development

```sh
npm install
npm run build        # dist/ (esbuild + tsc declarations)
npm test             # typecheck, type tests, unit tests, browser tests
npm run demo:react   # copy the build into demos/react, then `cd demos/react && npm start`
```

The browser tests run headless Chromium with Playwright (`npx playwright install chromium` the first time). They cover several tabs, the worker, the no-SharedWorker fallback including leader handover, cross-origin iframes, popups, origin trust and the v4 API.

The other folders in `demos/` are from v4 and have not been updated.

## License

MIT
