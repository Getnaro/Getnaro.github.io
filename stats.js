/* =========================================================
   FIREBASE STATS TRACKING – GETNARO (FINAL VERSION)
========================================================= */

import { getDatabase, ref, onValue, get, set, update }
from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const db = getDatabase();

/* =========================================================
   1️⃣ AUTO COUNT TOTAL APPS
========================================================= */

function updateTotalApps() {
    const total = document.querySelectorAll(".content-one").length;
    set(ref(db, "stats/total_apps"), total);
}
updateTotalApps();

/* =========================================================
   2️⃣ DOWNLOAD COUNTING (TOTAL + PER APP)
========================================================= */

document.querySelectorAll(".content-one a").forEach(btn => {
    btn.addEventListener("click", () => {

        const card = btn.closest(".content-one");
        const appName = card.querySelector("h5").innerText.trim();

        const totalDL = ref(db, "stats/total_downloads");
        const appDL = ref(db, "app_downloads/" + appName);

        // update total downloads
        get(totalDL).then(s => {
            const now = s.val() ?? 0;
            set(totalDL, now + 1);
        });

        // update per-app downloads
        get(appDL).then(s => {
            const now = s.val() ?? 0;
            set(appDL, now + 1);
        });

    });
});

/* =========================================================
   3️⃣ TOTAL VISITS (EVERY PAGE LOAD)
========================================================= */

const visitRef = ref(db, "stats/total_visits");

get(visitRef).then(snapshot => {
    const current = snapshot.val() ?? 0;
    set(visitRef, current + 1);
});

/* =========================================================
   4️⃣ LIVE VISITORS + PEAK VISITORS
========================================================= */

const liveRef = ref(db, "stats/live_visitors");
const peakRef = ref(db, "stats/peak_visitors");

// Add new visitor
get(liveRef).then(s => {
    const current = s.val() ?? 0;
    const updated = current + 1;

    set(liveRef, updated);

    // Check peak
    get(peakRef).then(p => {
        const peak = p.val() ?? 0;
        if (updated > peak) set(peakRef, updated);
    });
});

// Remove visitor on exit
window.addEventListener("beforeunload", () => {
    get(liveRef).then(s => {
        const current = s.val() ?? 1;
        set(liveRef, Math.max(0, current - 1));
    });
});

/* =========================================================
   5️⃣ LIVE REAL-TIME UI UPDATE
========================================================= */

function bind(path, htmlId) {
    onValue(ref(db, path), snap => {
        document.getElementById(htmlId).textContent = snap.val() ?? 0;
    });
}

bind("stats/total_apps",      "stat-total-apps");
bind("stats/total_visits",    "stat-total-visits");
bind("stats/peak_visitors",   "stat-peak");
bind("stats/total_downloads", "stat-downloads");
bind("stats/live_visitors",   "stat-viewing");
