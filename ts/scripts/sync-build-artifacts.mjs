import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(tsDir, "..");
const distDir = path.join(tsDir, "dist");

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

copyDirectoryContents(distDir, path.join(repoRoot, "copilot", "ts", "dist"));
console.log("copilot MCP dist synced");

const pluginJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf8"),
);
const claudeCache = path.join(
  os.homedir(),
  ".claude",
  "plugins",
  "cache",
  "agentOW",
  "agentOW",
  pluginJson.version,
);

if (!fs.existsSync(claudeCache)) {
  console.log(`claude plugin cache not found, skipped: ${claudeCache}`);
  process.exit(0);
}

copyDirectoryContents(distDir, path.join(claudeCache, "ts", "dist"));
copyMatchingFiles(path.join(repoRoot, "agents"), path.join(claudeCache, "agents"), (name) => name.endsWith(".md"));
copyMatchingFiles(path.join(repoRoot, "docs"), path.join(claudeCache, "docs"), (name) => name.endsWith(".md"));
copyDirectoryContents(path.join(repoRoot, "skills"), path.join(claudeCache, "skills"));
copyDirectoryContents(path.join(repoRoot, "tools"), path.join(claudeCache, "tools"));
console.log(`cache synced to ${claudeCache}`);
