# AI Agent Instructions

> **Self-maintenance rule.** If a change alters this repo's shape, stack, verification loop, or guardrails, update this file as part of the same change. This rule does not authorize creating a commit.

This repo is a small Firebase/static PWA for tracking espresso beans, brew logs, recipes, and barista advice. Keep changes conservative and preserve the existing app structure.

## Project Shape

- Browser app files live in `public/`.
- Main UI shell: `public/index.html`.
- Main styling: `public/style.css`.
- Main orchestration and event wiring: `public/js/app.js`.
- Firebase initialization: `public/js/firebase-client.js`.
- Firebase persistence boundaries: `public/js/*-repository.js`.
- Feature presentation modules: `public/js/*-view.js`.
- Shared DOM and navigation helpers: `public/js/dom.js` and `public/js/router.js`.
- Brew advice rules: `public/js/brew-advice.js`.
- Elizabeth machine profiles and tuning rules: `public/js/elizabeth-tuning.js`.
- Bianca machine profiles and flow-tuning rules: `public/js/bianca-tuning.js`.
- Machine profile defaults, normalization, and maintenance schedules: `public/js/machine-config.js`.
- Firebase browser config: `public/js/firebase-config.js`.
- Tests: Node tests under `test/`, including pure domain/view-model tests and `test/ui-smoke.test.js` architecture guardrails.
- Storage rules: `storage.rules`.

This is not a React, Vite, Next.js, or bundled frontend project. Do not add a build system unless explicitly asked.

## Required Checks

Run these after JavaScript changes:

```sh
npm run check
npm test
```

## Frontend Rules

- Preserve the current static HTML/CSS/ES module architecture.
- Keep Firebase SDK calls inside `*-repository.js` modules; `app.js` should coordinate repositories rather than query Firebase directly.
- Keep reusable DOM construction in `*-view.js` modules and shared element helpers in `dom.js`; feature views should receive plain data and callbacks.
- Keep Firebase browser imports as CDN ES module imports unless the project is intentionally migrated to a bundler.
- Keep the release query string synchronized across `index.html`, every local ES-module import, and the service-worker app shell so an update cannot mix incompatible cached modules. Keep document navigations network-first while caching static assets stale-while-revalidate.
- Keep the current release and deploy-stamped commit visible in the app header, and preserve the service-worker update banner with its explicit refresh action.
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

## Existing Behavior To Preserve

- `getBrewAdvice` is deterministic and covered by Node tests.
- Elizabeth tuning must stay version-aware, default temperature display to Fahrenheit, treat programmed doses as timed auto-stops, and keep chassis/OPV work behind explicit safety warnings.
- Bianca tuning must distinguish V1/V2 from V3, start with paddle fully open and automation off, treat flow and pressure as interacting measurements, and reserve pump/PID changes for advanced guidance.
- Bean cards, log rows, global stats, and analytics are rendered dynamically.
- The floating add/log buttons are route-aware.
- The app uses Google sign-in and routes by hash/history state.
- CSV export should work from Settings without requiring extra dependencies.
- Machine care is model-specific and one-tap: preserve the Elizabeth schedule and the Bianca manual's daily/weekly, 70-liter/four-month filter, and annual technician-service schedules. Custom logs stay secondary.
- Machine care records show only the latest reminder for each service type as active; older reminders remain visible as history. Manual-based weekly/monthly tasks calculate their next due date automatically.

## Style Of Changes

- Prefer small, focused fixes over broad rewrites.
- Match the existing naming and formatting style.
- Keep comments sparse and useful.
- If you add a new user-facing behavior, include the smallest practical test or manual verification note.
