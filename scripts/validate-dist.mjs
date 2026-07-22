import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const manifestPath = path.join(distDir, "manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error("dist/manifest.json is missing");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const required = [
  "background.js",
  manifest.action && manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((entry) => [
    ...(entry.js || []),
    ...(entry.css || [])
  ])
].filter(Boolean);

for (const file of required) {
  if (file.includes("src/")) {
    throw new Error(`dist manifest references source path: ${file}`);
  }

  if (!existsSync(path.join(distDir, file))) {
    throw new Error(`dist manifest references missing file: ${file}`);
  }
}

if (manifest.manifest_version !== 3) {
  throw new Error("dist manifest must be Manifest V3");
}
