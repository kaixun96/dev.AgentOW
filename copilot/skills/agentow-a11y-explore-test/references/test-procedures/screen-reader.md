# Screen reader

1. Use real NVDA or Narrator interaction for every result in this category. Do not use
   Accessibility Tree, DOM, ARIA, axe, or browser accessibility snapshots as screen-reader tests.
2. For an NVDA claim, use real OS input and preserve Speech Viewer transcript, screenshot,
   focused-element UIA state, and synchronized recording when required.
3. For Narrator-specific behavior, stop NVDA first and preserve Narrator/UIAutomationCore/Speech-TTS
   ETW, screenshot, and UIA state.
4. Repeat the task using the canonical steps and record exact announcements.
5. Correlate each trigger to speech and explicitly check silence, duplication, stale output, timing,
   and interaction mode.

If real AT is unavailable, record the screen-reader category as `inconclusive` with justified
`NOT_TESTED` criteria. Run browser semantics separately under `structure-semantics`; never place
that evidence in this category or report a screen-reader PASS from it.
