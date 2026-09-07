import assert from "node:assert/strict";
import { fetchAdoWithRetry } from "../src/ow/tools/adoHttp.ts";

const responses = [
  new Response("throttled", { status: 429, headers: { "Retry-After": "3" } }),
  new Response("ok", { status: 200 }),
];
const delays = [];
const response = await fetchAdoWithRetry("https://example.invalid", {}, {
  fetchImpl: async () => responses.shift(),
  sleepImpl: async (milliseconds) => delays.push(milliseconds),
  random: () => 0,
});
assert.equal(response.status, 200);
assert.deepEqual(delays, [3000]);

let patchCalls = 0;
const patch = await fetchAdoWithRetry("https://example.invalid", { method: "PATCH" }, {
  fetchImpl: async () => { patchCalls += 1; return new Response("throttled", { status: 429 }); },
  sleepImpl: async () => { throw new Error("PATCH must not retry"); },
});
assert.equal(patch.status, 429);
assert.equal(patchCalls, 1);
console.log("ADO HTTP tests passed");
