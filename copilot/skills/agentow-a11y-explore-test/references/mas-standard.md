# MAS Web evaluation standard

Microsoft Accessibility Standards (MAS) is the normative pass/fail standard for this workflow.
Use public WCAG success-criterion identifiers only as the mapping keys used by plans, evidence, and
reports. WCAG guidance may explain or test a mapped rule, but it does not replace the applicable MAS
requirement.

Do not copy, publish, or embed internal or NDA MAS source text or links. The authorized evaluator is
responsible for checking the current MAS Web source outside this public repository.

Plans record only a non-sensitive attestation: authorized MAS Web source consulted, check time, and
`contentEmbedded: false`. Every mapped SC result records `standardRule: "MAS <public WCAG key>"` and
`standardCheck: "authorized-source-consulted"`. These fields bind the evaluation to MAS without
publishing restricted content.

Reduced motion is a supporting test mode, not a standalone MAS Web failure in the current profile.
Test moving or auto-updating content under MAS 2.2.2 in ordinary motion mode. Test reduced-motion
behavior separately as compatibility guidance. MAS 2.5.4 covers motion used as an input mechanism,
not visual animation.
