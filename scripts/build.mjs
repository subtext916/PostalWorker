// Bundles the library with esbuild. Type declarations come from `tsc -p tsconfig.build.json`.
import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

const common = { bundle: true, target: "es2022", sourcemap: true, logLevel: "warning" };

await Promise.all([
  // ES module for bundlers: import { createPostalWorker } from "postalworker-es"
  build({ ...common, entryPoints: ["src/index.ts"], format: "esm", outfile: "dist/index.js" }),
  // helper + types for worker scripts
  build({ ...common, entryPoints: ["src/worker-script.ts"], format: "esm", outfile: "dist/worker-script.js" }),
  // the worker itself: a classic script, served from your site
  build({ ...common, entryPoints: ["src/worker/index.ts"], format: "iife", outfile: "dist/PostalSharedWorker.js" }),
  // script-tag build: window.PostalWorker / window.createPostalWorker
  build({ ...common, entryPoints: ["src/global.ts"], format: "iife", minify: true, outfile: "dist/PostalWorker.min.js" }),
]);

console.log("built dist/");
