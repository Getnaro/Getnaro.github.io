/* =========================================================
   FIREBASE STATS TRACKING – GETNARO (FINAL FIXED VERSION)
   - FIXED: Live visitors logic (switched to connection list)
   - FIXED: Removed syntax errors at bottom of file
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getDatabase, ref, onValue, runTransaction, onDisconnect, 
    push, set, remove 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// 1. CONFIGURATION 
const firebaseConfig = {
  apiKey: "AIzaSyBwBvhi2FDUJEoOHWic-2Ka8nRWyj_7uzo",
  authDomain: "stat-getnaroapp.firebaseapp.com",
  databaseURL: "https://stat-getnaroapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "stat-getnaroapp",
  storageBucket: "stat-getnaroapp.firebasestorage.app",
  messagingSenderId: "129355115034",
  appId: "1:129355115034:web:21c3c36ccb940d7fab7fa3"
};

const app = initializeApp(firebaseConfig, "stats-app");
const rtdb = getDatabase(app);

/* =========================================================
   2. DOWNLOAD COUNTING (EVENT DELEGATION)
========================================================= */

document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('a');
    
    if (btn && btn.closest('.content-one')) {
        const card = btn.closest(".content-one");
        const nameTag = card.querySelector("h5") || card.querySelector(".fs-title");
        
        if (nameTag) {
            const appName = nameTag.innerText.trim() || "Unknown App";
            const safeName = appName.replace(/[.#$/\[\]]/g, "_"); 

            // 1. Update total downloads
            const totalDLRef = ref(rtdb, "stats/total_downloads");
            runTransaction(totalDLRef, (current) => (current || 0) + 1);

            // 2. Update per-app downloads
            const appDlRef = ref(rtdb, `app_downloads/${safeName}`);
            runTransaction(appDlRef, (current) => (current || 0) + 1);
        }
    }
});

/* =========================================================
   3. TOTAL VISITS (INCREMENT ON PAGE LOAD)
========================================================= */

const visitRef = ref(rtdb, "stats/total_visits");
runTransaction(visitRef, (current) => (current || 0) + 1);

/* =========================================================
   4. LIVE VISITORS + PEAK (FIXED CONNECTION METHOD)
========================================================= */

// We track individual connections instead of a simple counter
const connectionsRef = ref(rtdb, "stats/connections");
const peakRef = ref(rtdb, "stats/peak_visitors");
const connectedRef = ref(rtdb, ".info/connected");

// A. Manage Presence (Add user to list on connect, remove on disconnect)
onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        const con = push(connectionsRef);
        onDisconnect(con).remove();
        set(con, true);
    }
});

// B. Watch the list size to update UI and Peak
onValue(connectionsRef, (snap) => {
    // snap.size returns the number of keys in the connections list
    const liveCount = snap.size;

    // Update UI immediately
    const liveEl = document.getElementById("stat-viewing");
    if(liveEl) {
        liveEl.textContent = liveCount;
        liveEl.style.opacity = 0.5;
        setTimeout(() => liveEl.style.opacity = 1, 200);
    }

    // Update Peak if current live count is higher
    runTransaction(peakRef, (currentPeak) => {
        return (liveCount > (currentPeak || 0)) ? liveCount : currentPeak;
    });
});

/* =========================================================
   5. LIVE REAL-TIME UI UPDATE 
========================================================= */

function bind(path, htmlId) {
    const el = document.getElementById(htmlId);
    if(!el) return;

    onValue(ref(rtdb, path), snap => {
        el.textContent = snap.val() ?? 0;
        el.style.opacity = 0.5;
        setTimeout(() => el.style.opacity = 1, 200);
    });
}

bind("stats/total_apps",      "stat-total-apps");
bind("stats/total_visits",    "stat-total-visits");
bind("stats/peak_visitors",   "stat-peak");
bind("stats/total_downloads", "stat-downloads");
// Note: "stats/live_visitors" is removed from here because it is handled in Section 4