import assert from "node:assert/strict";
import {
  ADO_PR_DESCRIPTION_MAX_LENGTH,
  VISUAL_SECTION_END,
  VISUAL_SECTION_START,
  preparePrDescriptionUpdate,
} from "../src/ow/tools/prDescriptionBudget.js";

const first = preparePrDescriptionUpdate(
  "## Summary\nKeep this.",
  "## Visual Validation\n\n| Scenario | BEFORE | AFTER |\n|---|---|---|\n| Default | old | new |",
);
assert.match(first.description, /Keep this/);
assert.match(first.description, new RegExp(VISUAL_SECTION_START));
assert.match(first.description, new RegExp(VISUAL_SECTION_END));

const replaced = preparePrDescriptionUpdate(
  first.description,
  "## Visual Validation\n\n| Scenario | BEFORE | AFTER |\n|---|---|---|\n| Option B | old-b | new-b |",
);
assert.equal(replaced.replacedVisualSection, true);
assert.doesNotMatch(replaced.description, /Default/);
assert.equal(replaced.description.match(/agentow:visual-validation:start/g)?.length, 1);

const legacy = preparePrDescriptionUpdate(
  "## Summary\nKeep.\n\n## Visual Validation Attachments\n\n- old.png",
  "## Visual Validation\n\nNew evidence.",
);
assert.doesNotMatch(legacy.description, /old\.png/);
assert.match(legacy.description, /New evidence/);

const pruned = preparePrDescriptionUpdate(
  [
    "## Summary",
    "Required.",
    "<!-- agentow:disposable:start verbose diagnostics -->",
    "x".repeat(200),
    "<!-- agentow:disposable:end -->",
  ].join("\n"),
  "## Visual Validation\n\nRequired screenshots.",
  180,
);
assert.deepEqual(pruned.prunedSections, ["verbose diagnostics"]);
assert.doesNotMatch(pruned.description, /x{20}/);
assert.match(pruned.description, /Required screenshots/);

assert.throws(
  () =>
    preparePrDescriptionUpdate(
      `## Summary\n${"x".repeat(ADO_PR_DESCRIPTION_MAX_LENGTH)}`,
      "## Visual Validation\n\nRequired screenshots.",
    ),
  /Human-authored content and required visual evidence were preserved/,
);

console.log("PR description budget fixtures passed");
