# AI Agent Instructions

> ⚙️ **Self-maintenance rule — do this automatically, every time.** If a change you make alters this repo's **shape** (files, entry points, structure), its **stack/dependencies**, the **build/test loop**, or a **guardrail**, you MUST update the matching section of THIS file in the *same commit* — before the task counts as done. This is not optional cleanup or a follow-up task.

This repo is a small Firebase/static PWA for tracking espresso beans, brew logs, recipes, and barista advice. Keep changes conservative and preserve the existing app structure.

## Project Shape

- Browser app files live in `public/`.
- Main UI shell: `public/index.html`.
- Main styling: `public/style.css`.
- Main client logic: `public/js/app.js`.
- Brew advice rules: `public/js/brew-advice.js`.
- Firebase browser config: `public/js/firebase-config.js`.
- Cloud Functions: `functions/index.js`.
- Tests: `test/brew-advice.test.js`.
- Storage rules: `storage.rules`.

This is not a React, Vite, Next.js, or bundled frontend project. Do not add a build system unless explicitly asked.

## Required Checks

Run these after JavaScript changes:

```sh
npm run check
npm test
```

If you change Cloud Functions dependencies, also review `functions/package.json` and `functions/package-lock.json`.

## Frontend Rules

- Preserve the current static HTML/CSS/ES module architecture.
- Keep Firebase browser imports as CDN ES module imports unless the project is intentionally migrated to a bundler.
- Do not remove CSS sections just because a class appears unused. Many classes are toggled dynamically from `public/js/app.js`.
- Check the key screens visually after UI changes: login, collection list, bean form, bean detail, shot log, analytics, and settings.
- Keep mobile layout intact. The app is intended to work well on phones.
- Avoid one-off inline styles in new markup; prefer `public/style.css`.
- Do not use `innerHTML` for user-entered bean, tag, roaster, shot, or log data. Build DOM nodes and assign text with `textContent`.
- Keep `test/ui-smoke.test.js` passing after UI changes. It guards against oversized bean images, visible file inputs, stale inline styles, missing analytics controls, render-blocking chart loading, repeated shot-history reads, eager image loading, and regressions in offline caching.

## Data And Firebase Rules

- Do not commit secrets. Firebase client config is public app configuration, but API secrets belong in Firebase/Google secret management.
- Keep Firestore document ownership checks tied to `uid`.
- Store machine service history in `maintenance_records`; records must remain scoped to the signed-in user's `uid`.
- Store new bean photos in Firebase Storage under `users/{uid}/beans/{beanId}/...`; keep legacy Firestore `image` data readable but do not create new base64 image fields.
- Be careful with destructive operations. Beans should be archived with `archived: true` instead of deleted; shot logs can still be deleted after confirmation.
- Cloud Functions use Firebase Functions v2 and Node 22.

## Existing Behavior To Preserve

- `getAIAdvice` is deterministic and covered by Node tests.
- Bean cards, log rows, global stats, and analytics are rendered dynamically.
- The floating add/log buttons are route-aware.
- The app uses Google sign-in and routes by hash/history state.
- CSV export should work from Settings without requiring extra dependencies.
- Machine care records show only the latest reminder for each service type as active; older reminders remain visible as history.

## Style Of Changes

- Prefer small, focused fixes over broad rewrites.
- Match the existing naming and formatting style.
- Keep comments sparse and useful.
- If you add a new user-facing behavior, include the smallest practical test or manual verification note.
