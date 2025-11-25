import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAJrJnSQI7X1YJHLOfHZkknmoAoiOiGuEo",
    authDomain: "getnaroapp.firebaseapp.com",
    databaseURL: "https://getnaroapp-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "getnaroapp",
    storageBucket: "getnaroapp.firebasestorage.app",
    messagingSenderId: "304744138530",
    appId: "1:304744138530:web:8166344d61cdfa127ec77b",
    measurementId: "G-FLBX24J98C"
};

// --- SAFE INITIALIZATION ---
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// --- 2. AUTH STATE LISTENER ---
onAuthStateChanged(auth, (user) => {
    const accountLinks = document.querySelectorAll('a[href*="login.html"], a[href*="profile.html"]');

    accountLinks.forEach(link => {
        const text = link.innerText.trim().toUpperCase();
        
        if (text.includes("ACCOUNT") || text.includes("PROFILE")) {
            // FIX: Only treat as logged in if NOT anonymous
            if (user && !user.isAnonymous) {
                // --- REAL USER LOGGED IN ---
                link.href = "/pages/profile.html";
            } else {
                // --- GUEST OR LOGGED OUT ---
                link.href = "/pages/login.html";
            }
        }
    });
});