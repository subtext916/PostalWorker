// Compile-time tests: this file must type-check, and every @ts-expect-error must be a real error.
import { createPostalWorker, type BoxItem } from "../../src/index";
import PostalWorker from "../../src/index";
import { defineWorkerScript } from "../../src/worker-script";

type AppSchema = {
  events: { "cart:updated": { items: number }; ping: number; ready: undefined };
  boxes: { volume: number; user: { name: string } };
  packages: { avatar: Blob };
};

const postal = createPostalWorker<AppSchema>({ workerUrl: "/PostalSharedWorker.js" });

// events
const off: () => void = postal.on("cart:updated", (m, meta) => {
  const n: number = m.items;
  const from: string = meta.from;
  void n; void from;
});
off();
postal.fire("cart:updated", { items: 3 });
postal.fire("ping", 1, "others");
postal.fire("ping", 1, { to: postal.id });
postal.fire("ready", undefined, "local");
// @ts-expect-error unknown message class
postal.fire("cart:deleted", { items: 1 });
// @ts-expect-error wrong payload type
postal.fire("ping", "one");
// @ts-expect-error missing payload field
postal.fire("cart:updated", {});
// @ts-expect-error invalid audience
postal.fire("ping", 1, "everyone");
// @ts-expect-error handler expects the wrong payload
postal.on("ping", (m: string) => m);

// cross-window uses the same event map
postal.crossOn("ping", (n, meta) => { const x: number = n; const o: string = meta.origin; void x; void o; }, "https://example.com", { features: { popup: true } });
// @ts-expect-error wrong payload
postal.crossFire("ping", "x");

// boxes
postal.postBox("volume", (item) => {
  const v: number | null = item.value;
  const all: Partial<{ volume: number | null; user: { name: string } | null }> = item.box;
  const closed: boolean = item.closed;
  void v; void all; void closed;
});
postal.post("user", { name: "Russ" });
// @ts-expect-error wrong value type
postal.post("volume", "loud");
// @ts-expect-error unknown box
postal.post("brightness", 1);

// packages
postal.package("avatar", ({ content }) => { const b: Blob | null = content; void b; });
postal.pack("avatar", new Blob());
// @ts-expect-error wrong content type
postal.pack("avatar", "a string");

// untyped default schema: anything goes, payloads are unknown
const loose = createPostalWorker({ workerUrl: false });
loose.on("anything", (m) => {
  // @ts-expect-error payload is unknown until narrowed
  m.foo;
});
loose.fire("anything", { any: "thing" });

// config is checked too
// @ts-expect-error workerUrl is required
createPostalWorker({});
// @ts-expect-error fallback has two modes
createPostalWorker({ workerUrl: false, fallback: "polyfill" });

// worker scripts
defineWorkerScript<AppSchema>((pw) => {
  pw.on("ping", (n, { from }) => pw.fire("ping", n + 1, { to: from }));
  pw().on("ping", () => {}); // v4 style still typed
  pw.postBox("volume", (item: BoxItem<AppSchema["boxes"], "volume">) => void item.value);
  // @ts-expect-error worker cannot target "others"
  pw.fire("ping", 1, "others");
  // @ts-expect-error wrong payload
  pw.fire("ping", "x");
});

// v4 compatibility stays loose (any) and chainable
const legacy = PostalWorker({ PostalRoute: "/dist/" });
legacy.on("a", (m) => m.whatever).on("b", () => {});
const ok: boolean = legacy.fire("a", { x: 1 }, "PUBLIC");
void ok;
