import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// --- 1. FIREBASE CONFIG ---
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
const db = getDatabase(app);

// --- 2. INITIALIZE TRACKING ON PAGE LOAD ---
document.addEventListener("DOMContentLoaded", () => {
    const appCard = document.querySelector('.content-one');
    
    if (!appCard) return; // Not a download page

    // Extract App Details from HTML
    const appId = appCard.dataset.app; // e.g., "amd-pro-edition"
    const appName = appCard.querySelector('h1') ? appCard.querySelector('h1').textContent.trim() : "Unknown App";
    const appIcon = appCard.querySelector('.gn-card-left img') ? appCard.querySelector('.gn-card-left img').src : "";
    
    // Elements
    const btnDownload = appCard.querySelector('.gn-btn-download');
    const btnUpdate = appCard.querySelector('.gn-btn-update');
    const btnUninstall = appCard.querySelector('.gn-btn-uninstall');
    // Find the status text span (handles different IDs like #install-status-amdpro)
    const statusText = appCard.querySelector('[id^="install-status"]');

    // --- 3. LISTEN FOR USER AUTH ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const appRef = ref(db, `users/${user.uid}/history/${appId}`);

            // A. CHECK IF ALREADY INSTALLED
            onValue(appRef, (snapshot) => {
                if (snapshot.exists()) {
                    // APP IS INSTALLED
                    const data = snapshot.val();
                    showInstalledState(data.timestamp);
                } else {
                    // APP IS NOT INSTALLED
                    showNotInstalledState();
                }
            });

            // B. HANDLE DOWNLOAD CLICK
            if (btnDownload) {
                btnDownload.onclick = (e) => {
                    // Allow the download link to work (don't preventDefault)
                    // But save to DB simultaneously
                    saveToHistory(user.uid, appId, appName, appIcon);
                };
            }

        } else {
            // Guest User
            showNotInstalledState();
            // If guest clicks download, prompt login
            if (btnDownload) {
                btnDownload.onclick = (e) => {
                    e.preventDefault();
                    alert("Please login to download and track apps.");
                    window.location.href = "/pages/login.html";
                };
            }
        }
    });

    // --- HELPER FUNCTIONS ---

    function saveToHistory(uid, id, name, icon) {
        const timestamp = Date.now();
        // Create a nice readable date string
        const dateString = new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        set(ref(db, `users/${uid}/history/${id}`), {
            appName: name,
            appId: id,
            icon: icon,
            timestamp: timestamp,
            installedDate: dateString, // Saving the readable date string
            status: 'installed'
        }).then(() => {
            console.log("App added to history");
            // UI updates automatically via the onValue listener above
        }).catch((err) => {
            console.error("Error tracking app:", err);
        });
    }

    function showInstalledState(timestamp) {
        if (btnDownload) btnDownload.style.display = "none";
        if (btnUpdate) btnUpdate.style.display = "inline-flex"; 
        if (btnUninstall) btnUninstall.style.display = "inline-flex";

        if (statusText) {
            const date = new Date(timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            statusText.innerHTML = `<span style="color:#00e676; font-weight:bold;">Installed on ${date}</span>`;
        }
    }

    function showNotInstalledState() {
        if (btnDownload) btnDownload.style.display = "inline-flex";
        if (btnUpdate) btnUpdate.style.display = "none";
        if (btnUninstall) btnUninstall.style.display = "none";
        
        if (statusText) {
            statusText.innerHTML = "Not Installed";
        }
    }
});