# Keyboard and focus

1. Establish the initial page state and dismiss only non-product onboarding.
2. Use real OS input when validating OS/AT focus; CDP keys support browser-only observations.
3. Traverse forward and backward through every interactive region.
4. Record focus order, traps, unreachable controls, unexpected context changes, and restoration after
   dialogs/menus close.
5. Verify visible focus at normal and high-contrast settings. Inspect ancestor and pseudo-element
   styles before concluding the indicator is missing.
6. Capture the focused element, screenshot, ordered focus sequence, and input method.
7. Exercise dialog/menu open, internal navigation, Escape dismissal, return focus, and reverse
   traversal where those states exist.

Do not call browser focus movement a real-AT result.
