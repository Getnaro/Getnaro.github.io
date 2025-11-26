/* =========================================================
   FIREBASE STATS TRACKING – GETNARO (FINAL FIXED VERSION)
   - FIXED: 'total-visits' typo in bind function.
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getDatabase, ref, onValue, runTransaction, onDisconnect 
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
   4. LIVE VISITORS + PEAK (FIREBASE PRESENCE)
========================================================= */

const liveRef = ref(rtdb, "stats/live_visitors");
const peakRef = ref(rtdb, "stats/peak_visitors");
const connectedRef = ref(rtdb, ".info/connected");

onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        runTransaction(liveRef, (current) => {
            const newVal = (current || 0) + 1;
            runTransaction(peakRef, (peak) => (newVal > (peak || 0) ? newVal : peak));
            return newVal;
        });
        onDisconnect(liveRef).transaction((current) => (current && current > 0) ? current - 1 : 0);
    }
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
bind("stats/total_visits",    "stat-total-visits"); // <--- FIX IS HERE (Changed hyphen to underscore)
bind("stats/peak_visitors",   "stat-peak");
bind("stats/total_downloads", "stat-downloads");
bind("stats/live_visitors",   "stat-viewing");