[![Deploy to Firebase Hosting on merge](https://github.com/nlinc/lincoln-barista/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/nlinc/lincoln-barista/actions/workflows/firebase-hosting-merge.yml)
# Lincoln Barista ☕
A personal espresso tracking Progressive Web App (PWA) designed to help dial in shots by tracking grind settings, time, and yield.

## 🚀 Features

* **Bean Management:** Track different coffee bags, roasters, and roast dates.
* **Shot Logging:** Record grind setting, dose (in), time (s), and yield (out).
* **Auto-Analysis:** Automatically calculates the brew ratio and provides feedback:
    * 🟢 **Golden Zone:** 1:1.75 – 1:2.25 ratio (Balanced)
    * 🔵 **High Yield:** > 1:2.25 (Grind Finer)
    * 🟠 **Low Yield:** < 1:1.75 (Grind Coarser)
* **History Grouping:** Logs are grouped by the specific "Roast Batch" date to account for bean aging.
* **Smart Sorting:** Filter beans by Newest, Rating, or Name.
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
    * Open `public/index.html`.
    * Locate the `firebaseConfig` object at the bottom of the script.
    * Replace the values with your own project keys.
4.  **Deploy:**
    * Install the Firebase CLI: `npm install -g firebase-tools`
    * Run `firebase login` and `firebase init hosting`.
