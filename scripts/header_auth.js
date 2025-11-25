import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- 2. AUTH STATE LISTENER ---
onAuthStateChanged(auth, (user) => {
    // Select both Desktop and Mobile menu "Account" links
    // We look for links that currently point to login.html OR profile.html
    const accountLinks = document.querySelectorAll('a[href*="login.html"], a[href*="profile.html"]');

    accountLinks.forEach(link => {
        // Only target links that actually say "Account" or "Profile" to avoid breaking other links
        const text = link.textContent.trim().toUpperCase();
        if (text === "ACCOUNT" || text === "PROFILE") {
            
            if (user) {
                // --- SCENARIO: USER IS LOGGED IN ---
                // 1. Change Link to Profile
                link.href = "/pages/profile.html";
                // 2. (Optional) Change Text to 'Profile'
                // link.textContent = "PROFILE"; 
                console.log("User Logged In: Redirecting Account button to Profile");
            } else {
                // --- SCENARIO: USER IS LOGGED OUT ---
                // 1. Change Link to Login
                link.href = "/pages/login.html";
                // link.textContent = "ACCOUNT";
                console.log("User Logged Out: Redirecting Account button to Login");
            }
        }
    });
});