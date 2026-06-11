# GymRhythm Feedback Board

A public feedback/roadmap board with upvoting, status tracking, and a "Shipped"
section. The in-app **Feedback & Suggestions** button opens this site in the
system browser, already signed in (no second login). Built on the existing
Firebase project (`gymtracker-90638`) and hosted free on GitHub Pages.

## How it fits together

```
iOS app  ──tap Feedback──▶  createFeedbackSession (Cloud Function, mints custom token)
         ──opens system Safari with #t=<token>──▶  this site (GitHub Pages)
                                                     ├─ signInWithCustomToken (silent)
                                                     ├─ reads/writes Firestore `feedback` (Web SDK)
                                                     └─ Security Rules enforce: signed-in only, 1 vote/user
```

- **Read/submit/vote:** any signed-in (= premium) user.
- **Votes:** one per user (doc id = uid), blocked once an item is `done`.
- **`voteCount`:** maintained only by the `onFeedbackVote*` Cloud Functions, so it can't be faked from the client.
- **Status changes / responses / delete:** moderator (you) only.
- **Compliance:** opened in the *system browser*, never an in-app web view, so the public UGC stays outside App Store Guideline 1.2.

## One-time setup

### 1. Set your moderator UID (two files, must match)
Find your Firebase Auth uid: Firebase Console → Authentication → Users (or print `Auth.auth().currentUser?.uid` from the app while signed in as yourself).

- `firestore.rules` → `isFeedbackAdmin()` → replace `REPLACE_WITH_ADMIN_UID`.
- `feedback-web/firebase-config.js` → `ADMIN_UID` → same value.
- `firestore-tests/rules.test.js` → `ADMIN_UID` → keep in sync if you want the tests to keep passing.

### 2. (Optional) Web app id
`feedback-web/firebase-config.js` → `appId`. Auth + Firestore work without it; paste the real value from Firebase Console → Project settings → Your apps → Web app if you have one.

### 3. Deploy the Firestore rules
```bash
firebase deploy --only firestore:rules
```

### 4. Deploy the Cloud Functions
```bash
cd functions && npm run build
firebase deploy --only functions:createFeedbackSession,functions:onFeedbackVoteCreated,functions:onFeedbackVoteDeleted
```
(or `firebase deploy --only functions` to deploy everything.)

### 5. Host this folder on GitHub Pages
Create a repo named **`gymrhythm-feedback`** (same account as `gymrhythm-legal`), push the **contents of `feedback-web/`** to it, and enable Pages (Settings → Pages → Deploy from branch → `main` / root). The resulting URL must match the iOS app:

- Site: `https://Atlanticore09.github.io/gymrhythm-feedback/`
- iOS: `FeedbackPortalService.portalBaseURL` (update both if you use a different repo/URL).

### 6. Build the iOS app
`FeedbackPortalService.swift` is already added to the Xcode project — just build & run. The Feedback button now opens the portal; if the network/token call fails it falls back to the old in-app view.

## App Check note
`createFeedbackSession` enforces App Check (like the promo functions) — the app already has App Check, so the call works. This **website** talks to Firestore directly: if you have **App Check enforcement enabled on Firestore** in the console, add a reCAPTCHA-v3 App Check provider to this web app, or the board's reads/writes will be blocked. If Firestore App Check enforcement is off (default), no change needed.

## Add test feedback
Open the board from the app while signed in as yourself, tap **Add Feedback** a few times, then use the **Admin → status** dropdown to set one item to **Done** — it drops into the "Shipped" section with its vote count preserved and voting disabled. That's the quickest way to see every state.

## Verify the rules anytime
```bash
cd firestore-tests && npm test
```
Covers signed-in read, validated create (no spoofed author / pre-seeded votes / smuggled fields / forged timestamp), one-vote-per-user, done-locking, and moderator-only status/delete.
