import assert from "node:assert/strict";
import { digest, validateExport, renderCopy, validateCopy, checkCopies } from "./sync-a11y-capabilities.mjs";

const commit = "a".repeat(40);
const body = "export const fixture = true;\n";
const manifest = {
  schemaVersion: 1, repository: "kaixun96/dev.A11yAssist", version: "0.4.0",
  files: [{ source: "runtime/evidence-v1.mjs", target: "tools/validate-a11y-evidence.mjs", sha256: digest(body) }]
};
const manifestText = JSON.stringify(manifest) + "\n";
const lock = { schemaVersion: 1, repository: manifest.repository, commit, manifestText, manifestSha256: digest(manifestText) };
validateExport(manifest);
validateCopy(lock, renderCopy(commit, body));
validateCopy(lock, renderCopy(commit, body).replaceAll("\n", "\r\n"));
assert.throws(() => renderCopy("main", body), /exact reviewed/);
assert.throws(() => validateExport({ ...manifest, repository: "other/repository" }), /repository/);
assert.throws(() => validateExport({ ...manifest, files: [{ ...manifest.files[0], target: "../escape" }] }), /path/);
assert.throws(() => validateCopy(lock, renderCopy(commit, body + "changed")), /drift/);
assert.throws(() => validateCopy({ ...lock, manifestSha256: "b".repeat(64) }, renderCopy(commit, body)), /hash/);
assert.throws(() => validateCopy(lock, body), /provenance/);
await checkCopies();
const executableBody = "#!/usr/bin/env node\n" + body;
const executableManifestText = JSON.stringify({
  ...manifest, files: [{ ...manifest.files[0], sha256: digest(executableBody) }]
});
const executableCopy = renderCopy(commit, executableBody);
assert(executableCopy.startsWith("#!/usr/bin/env node\n// Generated"));
validateCopy({ ...lock, manifestText: executableManifestText, manifestSha256: digest(executableManifestText) }, executableCopy);
console.log("Shared A11y source, provenance, CRLF and negative drift checks passed.");
