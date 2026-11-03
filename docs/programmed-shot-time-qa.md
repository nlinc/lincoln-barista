# Programmed shot time — November 3, 2026

Owner request: fix repeated manual entry of the programmed P1/P2 shot duration and publish production. Task/chat: `barista-programmed-time-20261103` / `01a1a1a7-8a2b-7871-9414-5a367512d7b9`.

Baseline: published `7df11e1015d790dc6b742fe03a790026644660d6`, isolated checkout `worktrees/lincoln-barista/programmed-time-20261103`. Primary checkout, retained October 30 flow candidate and scheduled pilot are untouched.

Cause: new-shot profile selection used the saved/best recipe, often Manual, rather than the most recently used button. Starting-point/tuning entry also cleared the time after opening the form. P1/P2 controls were inside optional observations.

Release 1.18.7 keeps the latest explicitly recorded profile for the same bag, roast and machine; otherwise uses the recipe profile, then P1 for Elizabeth or Manual for Bianca. Current programmed phase totals supply the time, never the prior shot's measured time. Explicit Manual selections, typed overrides, saved shot times and blank actual yield are preserved. P1/P2 quick buttons and profile selection are visible outside optional observations; Bianca hides Elizabeth quick controls. New Elizabeth bag setup defaults to P1. No record migration or historical backfill.

Validation:

- Regression-first caller tests reproduced the missing default and lost latest-button selection. Final `node --test test/shot-profile-time.test.js`: 12/12 pass, covering default 30s, latest P2 versus stale/manual recipes, bag/roast/machine scope, current settings, manual/override behavior, historical edits/zeros, and first-shot/tuning entry.
- `node scripts/hosting-release.mjs gate`: syntax pass; 171 tests pass (including release-boundary tests), then 5/5 explicit release-boundary tests pass. Whitespace check passes.
- 46/46 browser assertions pass using synthetic auth, Firestore, Storage and profiles at 390×844 and 1280×900. Includes actual saves, P1 repeat, typed 31s override, next-shot return to configured 30s, P2 save/reload, preserved historical edit, Manual, tuning/starting entry and Bianca isolation. No uncaught exceptions or horizontal overflow.
- All seven required screens inspected at both widths: login, collection, bean form, detail, shot log, analytics and settings. Shot controls are visible with optional observations closed. Analytics retains the existing external-chart-unavailable fallback under the isolated fixture's CSP.
- Initial version assertions missed escaped release literals; corrected to 1.18.7 without weakening checks. Initial browser runs exposed duplicate text selectors and a closed first-shot-tools disclosure; corrected harness selectors/disclosure handling. The hidden P1/P2 observation controls led to the intentional UI fix above. Original failures retained.

Evidence: `/Users/nicholaslincoln/.local/share/lincoln-barista/programmed-time-20261103/` contains fixture, browser script/results/screenshots, original failures and full gate logs. No real account or coffee data was used. Physical Pixel, live Google sign-in and an actual installed-PWA offline upgrade were not exercised. Deployment receipt and exact served-byte verification belong to the shared task handoff.
