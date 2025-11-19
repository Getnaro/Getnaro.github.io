/* =========================================================
   FIREBASE STATS ENGINE — Getnaro (Final Optimized Build)
   Features:
   ✔ Total Apps Auto Count
   ✔ Per-App Downloads Tracking
   ✔ Total Downloads Counter
   ✔ Live Visitors Counter
========================================================= */

import { getDatabase, ref, onValue, get, update, set } 
from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const db = getDatabase();

/* =========================================================
   1️⃣ AUTO COUNT TOTAL APPS
   (Counts all .content-one elements dynamically)
========================================================= */

function updateTotalApps() {
    const appCount = document.querySelectorAll(".content-one").length;
    update(ref(db, "stats"), { apps_available: appCount });
}
updateTotalApps();


/* =========================================================
   2️⃣ PER-APP DOWNLOAD TRACKING + TOTAL DOWNLOADS
========================================================= */

// SELECT ALL DOWNLOAD BUTTONS
document.querySelectorAll(".content-one a").forEach(btn => {
    
    btn.addEventListener("click", () => {
        
        const card = btn.closest(".content-one");
        const appName = card.querySelector("h5").innerText.trim();

        const totalDLRef = ref(db, "stats/downloads");
        const appDLRef = ref(db, "app_downloads/" + appName);

        /* ---- Update Total Downloads ---- */
        get(totalDLRef).then(snap => {
            const current = snap.val() ?? 0;
            update(totalDLRef, current + 1);
        });

        /* ---- Update Per-App Downloads ---- */
        get(appDLRef).then(snap => {
            const current = snap.val() ?? 0;
            update(appDLRef, current + 1);
        });

    });

});


/* =========================================================
   3️⃣ LIVE VISITOR COUNTER
========================================================= */

const viewRef = ref(db, "stats/viewing");

// Increase by +1 when user enters
get(viewRef).then(snap => {
    const current = snap.val() ?? 0;
    set(viewRef, current + 1);
});

// Decrease by -1 when user leaves
window.addEventListener("beforeunload", () => {
    get(viewRef).then(snap => {
        const current = snap.val() ?? 1;
        set(viewRef, Math.max(0, current - 1));
    });
});


/* =========================================================
   4️⃣ LIVE READING INTO UI
========================================================= */

function liveRead(path, elementId) {
    onValue(ref(db, path), snapshot => {
        document.getElementById(elementId).textContent = snapshot.val() ?? 0;
    });
}

liveRead("stats/apps_available", "stat-total-apps");
liveRead("stats/apps_up_to_date", "stat-updated");     // you manually update this
liveRead("stats/apps_need_update", "stat-update-needed"); // manually update this
liveRead("stats/downloads", "stat-downloads");
liveRead("stats/viewing", "stat-viewing");
