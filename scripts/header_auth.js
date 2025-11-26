/**
 * HEADER AUTH
 * /scripts/header_auth.js
 */

import { mainAuth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

console.log("🔐 Header Auth: Starting...");

onAuthStateChanged(mainAuth, (user) => {
    const accountLinks = document.querySelectorAll('a[href*="login.html"], a[href*="profile.html"]');

    accountLinks.forEach(link => {
        const text = link.textContent.trim().toUpperCase();
        if (text === "ACCOUNT" || text === "PROFILE") {
            if (user && !user.isAnonymous) {
                link.href = "/pages/profile.html";
                console.log("✅ User Logged In:", user.email);
            } else {
                link.href = "/pages/login.html";
                console.log("⚠️ User Logged Out");
            }
        }
    });
});