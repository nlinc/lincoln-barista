[![Deploy to Firebase Hosting on merge](https://github.com/nlinc/lincoln-barista/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/nlinc/lincoln-barista/actions/workflows/firebase-hosting-merge.yml)
# Lincoln Barista ☕
A personal espresso tracking Progressive Web App (PWA) designed to help dial in shots by tracking grind settings, time, and yield.

## 🚀 Features

* **Bean Management:** Track different coffee bags, roasters, and roast dates.
* **Private Coffee Library:** Reuse details from active or archived coffees, with consistent roaster suggestions and duplicate guidance. Roaster details remain on your owned bean documents; there is no shared roaster database or automatic lookup.
* **Shot Logging:** Record grind, dose, time, yield, machine profile, taste, brew temperature, gauge pressure, first-drop time, and channeling observations.
* **Auto-Analysis:** Calculates roast-aware ratio and flow targets, then asks the user to confirm the result by taste.
* **New Bean Starting Point:** An 18.0g Falcon-tube measurement helps suggest a starting dose and Auto/manual basket choice. Save grinder and dose/ratio/headspace preferences per machine and measurements per bag, then log the first shot’s actual results.
* **Machine Choice:** Choose Elizabeth or Bianca during first-time setup; the choice is saved to the user profile and can be changed later in Settings.
* **Elizabeth Tuning Lab:** Builds P1 dark/P2 light starting profiles, explains steam versus bloom pre-infusion, and recommends one next change.
* **Bianca Flow Lab:** Separates the full-paddle baseline, V3 low-flow automation, programmed bloom, manual paddle profiles, brew offset, and pump-pressure diagnostics.
* **Advanced Elizabeth Reference:** Separates ordinary LCC controls, hidden PID settings, OPV calibration, and experimental modifications with version gates, sources, and safety warnings.
* **Temperature Preference:** Defaults to Fahrenheit and can switch the saved machine profile and tuning guidance to Celsius.
* **History Grouping:** Logs are grouped by the specific "Roast Batch" date to account for bean aging.
* **Smart Sorting:** Filter beans by Newest, Rating, or Name.
* **Age Trends:** Compare days off roast with grind movement, flow drift, consistency, and target-shot rate.
* **Machine Maintenance:** Use model-specific Elizabeth or Bianca care schedules, including Bianca weekly group/wand cycles, filter capacity, and annual technician service.
* **Care at a Glance:** See due cleaning tasks on the collection screen and mark completed work in one tap. These are in-app reminders, with unlogged longer-term tasks clearly labeled for tracking.
* **Guided Tuning:** Pick a bean, review its latest shot on the selected machine, and move from a starting plan to recording actual results. Advanced reference stays in an expandable section.
* **Mobile First:** Designed as a PWA to look and feel like a native app on iOS/Android.

## Everyday use

1. Open **Beans** and use **+** to add a bag. Select a bean and use the coffee button to log a shot. Grind, dose, yield, time, and taste stay together; machine observations are optional.
2. Open **Settings → My Baskets**, check your stock or Pullman baskets (15–17g, 17–19g, 19–22g), and choose **Save Settings**. The editor saves separately for Elizabeth and Bianca and preserves grinder preferences and calibrations. You do not need a bean measurement to add a basket.
3. For extra help, open **More tools** on a bean or **Tools & data** in Settings. **First-shot recipe** uses your saved baskets; **Dial in next shot** offers machine-specific guidance; **Shot trends** shows analytics. Settings also contains CSV export and sign-out.

The collection leads with beans, with one-tap machine care below. Bean detail leads with the current recipe and shot history. Repeat-coffee entry, shot summaries, basket calibration, and machine profiles are expandable.

## 🛠️ Tech Stack

* **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6 Modules). No build step required.
* **Backend:** Firebase Firestore (NoSQL Database).
* **Auth:** Firebase Authentication (Google Sign-In).
* **Deployment:** GitHub Actions ➔ Firebase Hosting.

## ⚙️ Setup (How to Fork)

This project is configured for a specific personal Firebase project. If you fork this repository to use for yourself, you must update the configuration:

1.  **Create a Firebase Project:** Go to [console.firebase.google.com](https://console.firebase.google.com).
2.  **Enable Services:**
    * **Authentication:** Enable "Google Sign-In".
    * **Firestore Database:** Create a database in production mode.
3.  **Update Config:**
   * Open `public/js/firebase-config.js`.
   * Replace the exported `firebaseConfig` values.
    * Replace the values with your own project keys.
4.  **Deploy:**
    * Install the Firebase CLI: `npm install -g firebase-tools`
    * Run `firebase login` and `firebase init hosting`.

## Local checks

```sh
npm run check
npm test
```

## v1.11.0 verification

The release was checked in an isolated local fixture using the real app UI and in-memory repositories. Phone-width review covered login, collection, bean form, bean detail, shot log, analytics, settings, machine care, and both tuning labs. Tested archived coffee reuse, one-tap care completion, switching machines, tuning-to-log, cancellation back to the selected bean, and saving a sample shot. Production user records were not changed by these checks. Node tests cover catalog normalization, safe metadata reuse, care dates and latest-record selection, tuning scoping, and update activation without forced navigation.


## v1.12.0 starting point calculator

In v1.12.0, **New Bean Starting Point** opened from the collection or **Starting Point** from a bean’s detail. In v1.13.0, use **More tools → First-shot recipe**; basket setup now lives in **Settings → My Baskets**. Select only baskets you own (stock or Pullman 15–17g, 17–19g, 19–22g), set your preferred dose range and optionally save your grinder baseline and normal ratio. Setup saves are separate from bean measurement saves.

The Falcon protocol always uses 18.0g in a dry 50 mL tube with consistent settling. Apparent whole-bean bulk density is `18 / volume` g/mL. Without basket calibration, the experimental dose heuristic compares the new volume to your measured reference volume, or an explicitly labeled assumed 40 mL reference. It caps the relative dose adjustment at ±10%, respects your dose range and nominal basket capacity, and chooses the closest owned basket. Roast supplies the existing machine-specific recipe baseline; process is context, and grinder click offsets are not inferred.

Numeric headspace needs a measured reference Falcon volume and a basket calibration: reference dose, tamped puck depth, and effective basket-floor-to-shower clearance including screw/puck-screen effects. The estimate assumes tamped density changes proportionally to whole-bean bulk density; verify dry clearance physically. Auto considers the desired headspace when calibration is available. Client normalization rejects invalid calibration geometry; Firestore bounds the saved calibration map and checks ownership and the setup’s scalar fields. Treat these outputs as first-shot hypotheses, not measured results. Yield/time stay blank in the shot log, with the suggested recipe displayed as a target. Existing advice and Guided tuning use subsequent shot results.

Verification: `npm run check` and all 86 Node tests passed. An isolated browser fixture with in-memory repositories covered phone-width login, collection, bean form, bean detail, shot log, analytics and settings, plus desktop calculator layout. It exercised Auto/manual baskets, measurement save/restore across bags, setup preservation through Settings, machine switching, calibration, save failures, and blank actual yield/time on handoff. The local Firestore emulator compiled the rules and accepted old/new profiles and measurements while rejecting wrong-owner writes, invalid scalar types/ranges and overflowing volume. Both machine setups with all four basket calibrations were checked. No production data was used or changed. Deploy Firestore rules together with the matching app release for the new saved fields.

## v1.13.0 simplification

Reduced the header to Beans and Settings, removed duplicate collection shortcuts and the separate global stats panel, and kept secondary tools behind disclosures. Pullman basket checkboxes are visible when Settings opens and share one save action with machine settings. Saved setup, calibration, and measurements retain their existing Firestore schema; no data migration or rule change is needed. Failed settings saves retain inputs and do not replace the active profile.

Verification: `npm run check` and all 87 Node tests passed. An isolated browser fixture with local repositories exercised basket save/reload, independent machine drafts, calibration preservation, validation, failed-save recovery, bean entry, shot save, blank actual yield/time on recipe handoff, analytics, both tuning flows, and one-tap care. Visual review covered phone-width login, collection, bean form/detail, shot log, analytics, and settings, plus desktop collection and settings. Production records were not used or modified.
