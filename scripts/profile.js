/* ============================================================
   PROFILE — FIXED MENU SWITCH + FIREBASE USER LOADING
   ============================================================ */

import { auth, db } from "./firebase-init.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    ref,
    get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* ============================
   VIEW SWITCHING
   ============================ */

const menuItems = document.querySelectorAll(".menu-list li");
const views = document.querySelectorAll(".view");

menuItems.forEach(item => {
    item.addEventListener("click", () => {
        const target = item.dataset.view;

        // logout handler
        if (target === "logout") {
            signOut(auth).then(() => {
                localStorage.removeItem("gn_uid");
                window.location.href = "/pages/login.html";
            });
            return;
        }

        // Hide all views
        views.forEach(v => v.classList.remove("active"));

        // Show selected view
        const viewToShow = document.getElementById(target + "View");
        if (viewToShow) {
            viewToShow.classList.add("active");
        }
    });
});

/* ============================
   AUTH CHECK
   ============================ */

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/pages/login.html";
        return;
    }

    // Save UID locally
    localStorage.setItem("gn_uid", user.uid);

    // Load account info
    loadAccount(user.uid);
});

/* ============================
   LOAD ACCOUNT INFO
   ============================ */

async function loadAccount(uid) {
    const accountBox = document.getElementById("accountInfo");

    try {
        const snapshot = await get(ref(db, "users/" + uid));
        if (!snapshot.exists()) {
            accountBox.innerHTML = "<p>No account data found.</p>";
            return;
        }

        const data = snapshot.val();

        accountBox.innerHTML = `
            <div class="dl-item">
                <strong>Username:</strong> ${data.username}<br>
                <strong>Email:</strong> ${data.email}
            </div>
        `;
    } catch (e) {
        accountBox.innerHTML = "<p>Error loading account data.</p>";
    }
}
