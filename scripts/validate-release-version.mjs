import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = packageJson.version;
const refName = process.env.GITHUB_REF_NAME || "";
const expectedTag = `v${version}`;

if (!version) {
  throw new Error("package.json version is missing");
}

if (!refName) {
  throw new Error("GITHUB_REF_NAME is missing");
}

if (refName !== expectedTag) {
  throw new Error(`Release tag ${refName} does not match package version ${expectedTag}`);
}
