// v5-style worker script
self.init = (pw) => {
  pw.on("ping", (n, { from }) => pw.fire("pong", { n: n + 1, from }, { to: from }));
  pw.on("worker-only", (m, { from }) => pw.fire("worker-saw", { m, from }));
  pw.postBox("in", ({ value }) => { if (value !== null) pw.post("out", `worker saw ${value}`); });
  pw.on("who", (_m, { from }) => pw.fire("members", pw.members(), { to: from }));
};
