import { build } from "vite";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;
const dist = resolve(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Content scripts cannot be ES modules, so each entry is bundled on its own as a classic script.
const entries = {
  background: "src/background/background.ts",
  content: "src/content/content.ts",
  injected: "src/injected/hook.ts",
  popup: "src/popup/popup.ts",
  options: "src/options/options.ts",
};

for (const [name, file] of Object.entries(entries)) {
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    build: {
      outDir: dist,
      emptyOutDir: false,
      minify: false,
      lib: { entry: resolve(root, file), name: `mpss_${name}`, formats: ["iife"], fileName: () => `${name}.js` },
    },
  });
}

cpSync(resolve(root, "static"), dist, { recursive: true });
cpSync(resolve(root, "../app/public/logo.png"), resolve(dist, "icon.png"));
console.log("Built extension to", dist);
