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
- Bean-photo save ordering: `public/js/bean-photo-save.js`. Save the bean record
  before deleting a removed/replaced stored photo. Failed or ambiguous record
  writes preserve the old photo; storage cleanup failure cannot invalidate a
  successful save. Keep this helper in the service-worker app shell.
- Bag compatibility and normalization: `public/js/bean-record.js`; historical shot metadata: `public/js/shot-record.js`. Bean and shot edits use transactions to preserve retired values under `legacy` before removing unsupported root fields.
- Owner-scoped offline data audit and concurrency-protected cleanup plans: `scripts/audit-data.mjs`. Keep source snapshots, plans, and receipts outside the repository; deploy matching rules and validate preservation before applying a plan.
- Feature presentation modules: `public/js/*-view.js`.
- Private coffee library suggestions and repeat-profile helpers: `public/js/bean-catalog-view.js` (derived from owned beans, including archives; no shared catalog collection).
- Home care checklist and latest-record selection: `public/js/care-status.js`.
- Home care tasks use a native disclosure. Default to a compact summary for zero/one current bag and while browsing Finished; keep the user's expand/collapse choice during same-mode rerenders. Sort/count controls disappear when the visible collection has at most one bag.
- Bag tile actions and Current/Finished collection: `public/js/collection-view.js`. Swipe left reveals actions; the visible menu supports touch, mouse, and keyboard. Finishing is reversible and only sets archive metadata; finished bags remain readable with their shots. New bag reuses descriptive details, while Put back restores the original bag.
- Finished collection search matches coffee names and roasters locally, independently of Current. Shot validation returns field-keyed errors; `public/js/shot-form-view.js` presents them with accessible descriptions and focus, while repository failures appear by Save.
- Bean and machine scoping for guided tuning: `public/js/tuning-session.js`.
- Shared DOM and navigation helpers: `public/js/dom.js` and `public/js/router.js`.
- Basket ownership, grinder preferences, and calibration have one editor in Settings (My Baskets), saved with the machine profile. First-shot recipes consume that saved setup; optional tools stay behind disclosures. Home leads with machine care and three recent beans; Show all expands the filtered/sorted collection.
- New bean dose/basket heuristics and calibration: `public/js/starting-point.js`; presentation: `public/js/starting-point-view.js`. Setup is saved per machine in `user_profiles.startingPoints`; Falcon weight/volume measurements belong to the individual bag (legacy records without weight mean 18g) in `beans.startingMeasurement`.
- Repeatable per-bag/per-machine targets: `public/js/brew-setup.js` and `brew-setup-view.js`, saved under `beans.brewSetups`. Saves patch only the selected machine. New shots record basket and optional tamper setting; unlabeled historical shots stay unknown unless explicitly backfilled from confirmed usage. New-bag reuse never copies setups or measurements. Saved dose/ratio targets stay stable until explicitly edited; new shot yield/time remain blank.
- Automatic best-shot grind: `public/js/best-shot.js` ranks complete shots for the same bag, roast batch, machine and saved basket/dose. Prefer recorded balanced taste, then recipe-range shots, then the ratio closest to the saved target (1:2 without a setup), with newest breaking ties. If nothing qualifies, resume the latest complete shot without overwriting a saved grind. Shot saves transactionally update only the selected machine’s saved grind; dose/ratio targets stay fixed. Preserve original shot dates during edits and retry grind saves without duplicating a newly created shot.
- Home shows one compact setup panel for the selected current bag, with a bean picker and edit/log actions. Keep its selection through rerenders; fall back to the latest current bag after finishing the selection, and hide the panel in Finished or with no current bags. Shot trends filter by exact basket and roast; the comparison keeps all baskets within the selected bean/roast/machine scope. Mixed-basket history must not produce age-drift regressions. Starting-grind suggestions in `shot-analytics.js` use recent successful measured shots on the same machine, basket and roast, with similar dose/ratio; prefer three shots for this bag, otherwise require five across two beans. Suggestions never overwrite a saved grind or historical shot and assume the grinder has not changed.
- Brew advice rules: `public/js/brew-advice.js`.
- Elizabeth machine profiles and tuning rules: `public/js/elizabeth-tuning.js`.
- Bianca machine profiles and flow-tuning rules: `public/js/bianca-tuning.js`.
- Machine profile defaults, normalization, and maintenance schedules: `public/js/machine-config.js`.
- Firebase browser config: `public/js/firebase-config.js`.
- Tests: Node tests under `test/`, including pure domain/view-model tests and `test/ui-smoke.test.js` architecture guardrails.
- CSV serialization and shot row mapping: `public/js/csv-export.js`. Preserve recorded zero values as zero, missing measurements as blank, and quote commas, quotes, CR and LF without changing stored records. Behavioral coverage: `test/csv-export.test.js`.
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
- Service-worker activation must never navigate open clients automatically; unfinished forms wait for the user's refresh action.
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
- Never merge bags by coffee name or infer measured values during normalization. Preserve retired ratings, five-bean measurements, flavor scales, and original date strings under `legacy`; keep bag/shot IDs, photos, results, and recorded timestamps intact. Missing historical machine labels follow the existing Elizabeth fallback.

## Existing Behavior To Preserve

- `getBrewAdvice` is deterministic and covered by Node tests.
- Elizabeth tuning must stay version-aware, default temperature display to Fahrenheit, treat programmed doses as timed auto-stops, and keep chassis/OPV work behind explicit safety warnings.
- Bianca tuning must distinguish V1/V2 from V3, start with paddle fully open and automation off, treat flow and pressure as interacting measurements, and reserve pump/PID changes for advanced guidance.
- Bean cards, log rows, shot summaries, and analytics are rendered dynamically. History shows recorded taste or concise brew advice; full tuning guidance belongs in the shot preview and tuning views.
- Blank roast dates stay unknown. Reusing a past coffee copies descriptive details only, leaving the new bag's date, image, impression, and shots separate.
- Starting-point bulk density is a whole-bean proxy, not tamped density. Numeric headspace requires a measured baseline and basket calibration; never prescribe click offsets from density alone or record recipe targets as measured shots.
- Guided tuning keeps intended targets separate from measured shot results and scopes history to the selected bean and machine.
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
