/**
 * Getnaro Dynamic Content Loader
 * Add this script to your index.html and app pages.
 * It fetches updated app details (Version, Desc, Links) from Firestore.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app);

async function updatePageData() {
    // 1. Check if we are on a specific App Page
    const pageWrapper = document.querySelector('.fs-page-wrapper');
    if (pageWrapper) {
        const appId = pageWrapper.dataset.app; // e.g. "lively-wallpaper"
        if (appId) {
            try {
                const docRef = doc(db, "apps", appId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    console.log("[DataLoader] Updating page for:", data.name);

                    // Update Title
                    const titleEl = document.querySelector('.fs-title');
                    if (titleEl && data.name) titleEl.textContent = data.name;

                    // Update Description
                    const descEl = document.querySelector('.fs-desc');
                    if (descEl && data.description) descEl.textContent = data.description;

                    // Update Version (Find the 'Version' stat box)
                    const stats = document.querySelectorAll('.fs-stat-item');
                    stats.forEach(stat => {
                        const h6 = stat.querySelector('h6');
                        if (h6 && h6.innerText.includes('Version')) {
                            const p = stat.querySelector('p');
                            if (p && data.version) p.innerText = data.version;
                        }
                        if (h6 && h6.innerText.includes('Updated')) {
                            const p = stat.querySelector('p');
                            if (p && data.lastUpdated) p.innerText = data.lastUpdated;
                        }
                    });

                    // Update Download Link
                    const dlBtn = document.querySelector('.gn-btn-download');
                    if (dlBtn && data.downloadLink) {
                        dlBtn.href = data.downloadLink;
                    }
                }
            } catch (e) {
                console.error("[DataLoader] Failed to fetch app details:", e);
            }
        }
    }

    // 2. If we are on Home Page (optional future expansion: generate cards dynamically)
    // For now, we stick to the user's request of "Updating details of the App Data Page"
}

document.addEventListener("DOMContentLoaded", updatePageData);