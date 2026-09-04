# WCAG evaluation standard

WCAG 2.2 Level A and AA is the normative pass/fail standard for this workflow. WCAG 3.0 drafts are
not conformance standards and cannot produce PASS or FAIL results.

Plans record `standard: "WCAG"`, `standardVersion: "2.2"`, `standardLevel: "AA"`, and a public
W3C Recommendation attestation. Every SC result records
`standardRule: "WCAG 2.2 SC <criterion>"` and
`standardCheck: "w3c-recommendation-consulted"`.

WAI-ARIA Authoring Practices and platform conventions guide expected component interaction, but
they are not WCAG success criteria. A pattern deviation is a best-practice observation unless it
also causes a demonstrated WCAG failure.

Test moving or auto-updating content for WCAG 2.2 SC 2.2.2 in ordinary motion mode. Test reduced
motion separately as supporting compatibility evidence; WCAG 2.3.3 is Level AAA and is outside the
default A/AA conformance result.
