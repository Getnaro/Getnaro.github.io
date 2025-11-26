/**
 * UNIFIED FIREBASE CONFIGURATION
 * /scripts/firebase-config.js
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// Main Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCtX1G_OEXmkKtBNGzWQFEYiEWibrMIFrg",
  authDomain: "user-getnaro.firebaseapp.com",
  databaseURL: "https://user-getnaro-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "user-getnaro",
  storageBucket: "user-getnaro.firebasestorage.app",
  messagingSenderId: "264425704576",
  appId: "1:264425704576:web:cfd98a1f627e9a59cc2a65"
};

// Stats Firebase Config (Separate Project)
const statsFirebaseConfig = {
  apiKey: "AIzaSyBwBvhi2FDUJEoOHWic-2Ka8nRWyj_7uzo",
  authDomain: "stat-getnaroapp.firebaseapp.com",
  databaseURL: "https://stat-getnaroapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "stat-getnaroapp",
  storageBucket: "stat-getnaroapp.firebasestorage.app",
  messagingSenderId: "129355115034",
  appId: "1:129355115034:web:21c3c36ccb940d7fab7fa3"
};

// Initialize Main App (ONLY ONCE)
let app, auth, db, firestore, storage;

if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // Set persistence immediately
    setPersistence(auth, browserLocalPersistence)
        .then(() => console.log("✅ Auth persistence enabled"))
        .catch(err => console.error("❌ Persistence error:", err));
        
    console.log("✅ Main Firebase initialized");
} else {
    app = getApps()[0];
    auth = getAuth(app);
}

db = getDatabase(app);
firestore = getFirestore(app);
storage = getStorage(app);

// Initialize Stats App (Separate)
let statsApp, statsDb;

function initializeStatsFirebase() {
    const existingStats = getApps().find(a => a.name === "stats-app");
    
    if (!existingStats) {
        statsApp = initializeApp(statsFirebaseConfig, "stats-app");
    } else {
        statsApp = existingStats;
    }
    
    statsDb = getDatabase(statsApp);
    return { statsApp, statsDb };
}

// Export everything
export const mainAuth = auth;
export const mainDb = db;
export const mainFirestore = firestore;
export const mainStorage = storage;
export const mainApp = app;
export { initializeStatsFirebase };