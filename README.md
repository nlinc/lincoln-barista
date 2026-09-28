[![Deploy to Firebase Hosting on merge](https://github.com/nlinc/lincoln-barista/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/nlinc/lincoln-barista/actions/workflows/firebase-hosting-merge.yml)
# Lincoln Barista ☕
A personal espresso tracking Progressive Web App (PWA) designed to help dial in shots by tracking grind settings, time, and yield.

## 🚀 Features

* **Bean Management:** Track different coffee bags, roasters, and roast dates.
* **Private Coffee Library:** Reuse details from active or archived coffees, with consistent roaster suggestions and duplicate guidance. Roaster details remain on your owned bean documents; there is no shared roaster database or automatic lookup.
* **Shot Logging:** Record grind, dose, time, yield, machine profile, taste, brew temperature, gauge pressure, first-drop time, and channeling observations.
* **Auto-Analysis:** Calculates roast-aware ratio and flow targets, then asks the user to confirm the result by taste.
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
