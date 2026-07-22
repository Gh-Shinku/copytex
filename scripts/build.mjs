import { build } from "esbuild";
import { mkdir, rm, readFile, writeFile, copyFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await bundle("src/background.ts", "background.js");
await bundle("src/content/index.ts", "content.js");
await bundle("src/popup/index.ts", "popup.js");

await copyFile("src/content.css", path.join(distDir, "content.css"));
await copyFile("src/popup.css", path.join(distDir, "popup.css"));
await writeFile(path.join(distDir, "popup.html"), await buildPopupHtml(), "utf8");
await writeFile(path.join(distDir, "manifest.json"), await buildManifest(), "utf8");

if (existsSync("assets")) {
  await cp("assets", path.join(distDir, "assets"), { recursive: true });
}

await assertRequiredFiles([
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.js",
  "popup.css"
]);

async function bundle(entryPoint, outfile) {
  await build({
    entryPoints: [entryPoint],
    outfile: path.join(distDir, outfile),
    bundle: true,
    format: "iife",
    target: "es2022",
    platform: "browser",
    logLevel: "silent"
  });
}

async function buildManifest() {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  manifest.version = packageJson.version || manifest.version;
  manifest.background.service_worker = "background.js";
  manifest.action.default_popup = "popup.html";
  manifest.content_scripts = manifest.content_scripts.map((entry) => ({
    ...entry,
    js: ["content.js"],
    css: ["content.css"]
  }));

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function buildPopupHtml() {
  const html = await readFile("src/popup.html", "utf8");
  return html.replace(/\s*<\/body>/, '\n    <script src="popup.js"></script>\n  </body>');
}

async function assertRequiredFiles(files) {
  const missing = files.filter((file) => !existsSync(path.join(distDir, file)));
  if (missing.length) {
    throw new Error(`Build missing required files: ${missing.join(", ")}`);
  }
}
