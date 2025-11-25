import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// --- FIREBASE CONFIG ---
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- AUTH STATE LISTENER ---
onAuthStateChanged(auth, (user) => {
    // Find "Account" or "Profile" links
    const accountLinks = document.querySelectorAll('a[href*="login.html"], a[href*="profile.html"]');

    accountLinks.forEach(link => {
        // Safe check for text content to ensure we target the main nav items
        const text = link.textContent.trim().toUpperCase();
        
        // Check if it's the Account/Profile button
        if (text === "ACCOUNT" || text === "PROFILE" || link.querySelector('i')) { // Logic adjusted to catch icon-only links if any
             if (user) {
                // User is LOGGED IN -> Point to Profile
                link.href = "/pages/profile.html";
                // Optional: Update text if you want
                // if(text === "ACCOUNT") link.textContent = "PROFILE";
            } else {
                // User is LOGGED OUT -> Point to Login
                link.href = "/pages/login.html";
                // if(text === "PROFILE") link.textContent = "ACCOUNT";
            }
        }
    });
});