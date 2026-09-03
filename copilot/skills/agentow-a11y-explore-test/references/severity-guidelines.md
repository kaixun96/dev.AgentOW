# Finding classification and severity

## Classification

- `VIOLATION`: observed failure of an applicable MAS Web requirement with reproducible evidence.
- `BEST-PRACTICE`: improvement beyond a proven MAS Web failure.
- `PASS`: the tested behavior met the stated expectation; scope the claim to the executed steps.
- `NEEDS-REVIEW`: evidence is incomplete or the requirement needs human interpretation.

Do not suppress an observation because another category may also find it. Deterministic aggregation
deduplicates equivalent findings later.

## Severity for violations

- `Critical`: blocks the primary task for assistive-technology or keyboard users with no workaround.
- `High`: major task or essential information is inaccessible; workaround is difficult.
- `Medium`: meaningful barrier with a usable workaround or limited scope.
- `Low`: localized failure with low task impact.

Disabled, hidden, offscreen, or inert controls are not violations unless users can reach or operate
them in the tested state. Cosmetic clipping is a violation only when content, focus indication, or
operation is lost.

Never assign severity to PASS, BEST-PRACTICE, or NEEDS-REVIEW.
