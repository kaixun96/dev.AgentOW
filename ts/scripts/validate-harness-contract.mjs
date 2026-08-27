import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateHarnessContract } from "./harness-contract-lib.mjs";

const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultRoot = path.resolve(tsDir, "..");
const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const contractIndex = args.indexOf("--contract");
const jsonOutput = args.includes("--json");
const repoRoot = rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : defaultRoot;
const contractPath = contractIndex >= 0
  ? path.resolve(args[contractIndex + 1])
  : path.join(repoRoot, "contracts", "harness-contract.json");

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const findings = validateHarnessContract({ repoRoot, contract });
const result = {
  contractVersion: contract.version,
  repoRoot,
  valid: findings.length === 0,
  errorCount: findings.length,
  findings,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else if (findings.length === 0) {
  console.log(`agentOW harness contract v${contract.version} validated`);
} else {
  for (const item of findings) {
    console.error(`${item.severity.toUpperCase()} ${item.rule} ${item.file}: ${item.message}`);
  }
  console.error(`agentOW harness contract failed with ${findings.length} error(s)`);
}

if (findings.length > 0) process.exitCode = 1;
