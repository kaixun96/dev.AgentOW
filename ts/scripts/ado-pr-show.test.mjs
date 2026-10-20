import assert from "node:assert/strict";
import { test } from "node:test";

import { readWithGitCredential } from "../../tools/ado-pr-show.mjs";

test("reads a PR with existing Git credentials", async () => {
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    return {
      code: 0,
      stdout: "protocol=https\nhost=dev.azure.com\nusername=user\npassword=secret\n",
      stderr: "",
    };
  };
  const request = async (url, options) => {
    calls.push({ url: url.toString(), options });
    return {
      ok: true,
      json: async () => ({ pullRequestId: 2441202 }),
    };
  };

  const result = await readWithGitCredential(
    "2441202",
    "https://dev.azure.com/onedrive",
    "SharePoint Online",
    run,
    request,
  );

  assert.deepEqual(result, { pullRequestId: 2441202 });
  assert.equal(calls[0].command, "git");
  assert.deepEqual(calls[0].args, ["credential", "fill"]);
  assert.equal(calls[0].options.input, "url=https://dev.azure.com/onedrive\n\n");
  assert.equal(calls[0].options.env.GCM_INTERACTIVE, "Never");
  assert.equal(calls[0].options.env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(calls[0].options.timeout, 30_000);
  assert.equal(
    calls[1].url,
    "https://dev.azure.com/onedrive/SharePoint%20Online/_apis/git/pullrequests/2441202?api-version=7.1",
  );
  assert.match(calls[1].options.headers.Authorization, /^Basic /);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("does not call ADO without a complete Git credential", async () => {
  const run = async () => ({ code: 0, stdout: "username=user\n", stderr: "" });
  let requested = false;
  const request = async () => {
    requested = true;
    throw new Error("unexpected request");
  };

  const result = await readWithGitCredential(
    "2441202",
    "https://dev.azure.com/onedrive",
    "SharePoint Online",
    run,
    request,
  );

  assert.equal(result, undefined);
  assert.equal(requested, false);
});

test("retries transient REST transport failures", async () => {
  const run = async () => ({
    code: 0,
    stdout: "username=user\npassword=secret\n",
    stderr: "",
  });
  let attempts = 0;
  const request = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("ECONNRESET");
    return {
      ok: true,
      json: async () => ({ pullRequestId: 2441202 }),
    };
  };

  const result = await readWithGitCredential(
    "2441202",
    "https://dev.azure.com/onedrive",
    "SharePoint Online",
    run,
    request,
  );

  assert.deepEqual(result, { pullRequestId: 2441202 });
  assert.equal(attempts, 2);
});
