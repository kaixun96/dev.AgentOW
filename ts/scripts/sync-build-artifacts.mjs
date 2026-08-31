import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(tsDir, "..");
const distDir = path.join(tsDir, "dist");
const copilotMirrorDirectories = [
  [distDir, path.join(repoRoot, "copilot", "ts", "dist")],
  [path.join(repoRoot, "skills", "ow-review", "references"), path.join(repoRoot, "copilot", "skills", "ow-review", "references")],
];
const copilotMirrorFileSets = [
  {
    source: path.join(repoRoot, "tools"),
    destination: path.join(repoRoot, "copilot", "tools"),
    predicate: (name) => name.endsWith(".mjs") || name === "package.json" || name === "package-lock.json",
  },
];
const copilotMirrorFiles = [
  ["review-rule-registry.json", "copilot/review-rule-registry.json"],
  ["graduation-review-rule-registry.json", "copilot/graduation-review-rule-registry.json"],
  ["docs/capability-bootstrap.md", "copilot/docs/capability-bootstrap.md"],
  ["docs/review-contract.md", "copilot/docs/review-contract.md"],
  ["docs/review-misses.md", "copilot/docs/review-misses.md"],
  ["docs/run-insights.md", "copilot/docs/run-insights.md"],
  ["contracts/run-insights.schema.json", "copilot/contracts/run-insights.schema.json"],
];

function copyDirectoryContents(source, destination) {
  if (!fs.existsSync(source)) {
    return false;
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
  }
  return true;
}

function copyMatchingFiles(source, destination, predicate) {
  if (!fs.existsSync(source)) {
    return false;
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile() && predicate(entry.name)) {
      fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
    }
  }
  return true;
}

for (const [source, destination] of copilotMirrorDirectories) {
  copyDirectoryContents(source, destination);
}

for (const fileSet of copilotMirrorFileSets) {
  copyMatchingFiles(fileSet.source, fileSet.destination, fileSet.predicate);
}

fs.mkdirSync(path.join(repoRoot, "copilot", "docs"), { recursive: true });
for (const [source, destination] of copilotMirrorFiles) {
  const destinationPath = path.join(repoRoot, destination);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, source), destinationPath);
}
console.log("copilot MCP dist synced");
