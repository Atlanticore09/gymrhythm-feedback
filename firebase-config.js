// ---------------------------------------------------------------------------
// Firebase web config for the GymRhythm feedback board.
//
// These values are NOT secret — Firebase web config is meant to ship in the
// client. Access is controlled by Firestore Security Rules, not by hiding this.
//
// Pre-filled from the project's GoogleService-Info.plist. The ONE value you
// should confirm is `appId`: open Firebase Console → Project settings →
// "Your apps" → (register/select a Web app) → copy its `appId` here. Auth +
// Firestore work without it, but it's best to use the real Web app id.
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "AIzaSyAOUTWhJCsFuQrqu9_CWJGb4Jjpi5DkW4w",
  authDomain: "gymtracker-90638.firebaseapp.com",
  projectId: "gymtracker-90638",
  storageBucket: "gymtracker-90638.firebasestorage.app",
  messagingSenderId: "555179111019",
  // Optional for Auth/Firestore. Paste your Web app id from the Firebase
  // Console if you have one (format: 1:555179111019:web:xxxxxxxxxxxx).
  appId: "",
};

// ---------------------------------------------------------------------------
// Moderator UID. ONLY this Firebase Auth user sees the admin controls (change
// status, post a response, delete). This is a UX gate only — the real
// enforcement lives in firestore.rules (`isFeedbackAdmin`), so keep the two in
// sync. Find your uid in Firebase Console → Authentication → Users, or print
// `Auth.auth().currentUser?.uid` from the app while signed in as yourself.
// ---------------------------------------------------------------------------
export const ADMIN_UID = "REPLACE_WITH_ADMIN_UID";

// Cloud Functions region (default). Only used for documentation/reference here.
export const FUNCTIONS_REGION = "us-central1";
