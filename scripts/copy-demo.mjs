// Copies the built library into the React demo (run `npm run build` first).
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const lib = "demos/react/src/postalworker";
await mkdir(lib, { recursive: true });
for (const f of await readdir("dist")) {
  if (f.endsWith(".d.ts")) await cp(`dist/${f}`, `${lib}/${f}`);
}
// Create React App lints everything under src/; the built library is not demo code.
const js = (await readFile("dist/index.js", "utf8")).replace(/\n\/\/# sourceMappingURL=.*\n?$/, "\n");
await writeFile(`${lib}/index.js`, `/* eslint-disable */\n${js}`);
await cp("dist/PostalSharedWorker.js", "demos/react/public/PostalSharedWorker.js");
console.log("copied dist/ into demos/react");
