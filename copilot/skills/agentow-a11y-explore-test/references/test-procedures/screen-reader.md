# Screen reader

1. Verify headings, landmarks, labels, descriptions, names, roles, states, values, reading order, and
   status announcements with browser semantics.
2. For an actual NVDA claim, use real OS input and preserve Speech Viewer transcript, screenshot,
   focused-element UIA state, and synchronized recording when required.
3. For Narrator-specific behavior, stop NVDA first and preserve Narrator/UIAutomationCore/Speech-TTS
   ETW, screenshot, and UIA state.
4. Repeat the task using the canonical steps and record exact announcements.

If real AT is unavailable, report browser semantics separately and mark the AT portion
`skipped-environment` or `inconclusive`; never report a screen-reader PASS.
