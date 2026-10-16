// Copies the built library into the React demo (run `npm run build` first).
import { cp, mkdir, readdir } from "node:fs/promises";

const lib = "demos/react/src/postalworker";
await mkdir(lib, { recursive: true });
for (const f of await readdir("dist")) {
  if (f === "index.js" || f.endsWith(".d.ts")) await cp(`dist/${f}`, `${lib}/${f}`);
}
await cp("dist/PostalSharedWorker.js", "demos/react/public/PostalSharedWorker.js");
console.log("copied dist/ into demos/react");
