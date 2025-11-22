import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, update, onValue } from "https://www.gstatic.com/firebasejs/9.9.0/firebase-database.js";

// --- Configuration ---
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

// Use a fallback for showToast 
const showToast = (message) => {
    if (typeof window.showToast === 'function') {
        window.showToast(message);
    } else {
        console.log(`[TOAST]: ${message}`);
    }
};


document.addEventListener("DOMContentLoaded", () => {
    // --- APP CARD SETUP ---
    const appCard = document.querySelector('.content-one');
    if (!appCard) return;

    const appId = appCard.dataset.app;
    // CRITICAL: Get app name for registry search
    const appName = appCard.querySelector('h1') ? appCard.querySelector('h1').textContent.trim() : "Unknown App";
    const appIconImg = appCard.querySelector('.gn-card-left img');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    const btnDownload = appCard.querySelector('.gn-btn-download');
    const btnUpdate = appCard.querySelector('.gn-btn-update');
    const btnUninstall = appCard.querySelector('.gn-btn-uninstall');
    
    // UI elements on the download card
    const statusText = appCard.querySelector('[id^="install-status"]');
    const locLink = appCard.querySelector('.fs-loc-link');
    
    let isMonitoring = false;
    let cachedFirebaseData = {};

    // --- NEW: App Info Retrieval Hook (For App Info Modal) ---
    if (window.appAPI && window.appAPI.getAppInfo) {
        window.appAPI.getAppInfo = async () => {
            // This is called by the renderer process via executeJavaScript, returns the data blob.
            const detectedPath = await window.appAPI.findAppPath(appName);
            const status = detectedPath ? "Installed" : "Not Installed";
            
            return {
                appName: appName,
                publisher: "Getnaro Team", 
                version: appCard.querySelector('.fs-stats p')?.innerText || "N/A", 
                platform: "Windows Desktop", 
                accountStatus: auth.currentUser ? "Logged In" : "Logged Out",
                installedDate: cachedFirebaseData.installedDate || status,
                storageSpace: "Unknown", 
            };
        };
    }

    // --- FIX: Listen for INSTALL START signal (From Renderer/Modal) ---
    if (window.appAPI && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            // Check if the received appName matches the app on this page
            // Use a clean version of the app name for comparison
            const pageAppNameClean = appName.toLowerCase().split(/\W/).filter(Boolean)[0];
            const signalAppNameClean = data.appName ? data.appName.toLowerCase().split(/\W/).filter(Boolean)[0] : null;

            if (signalAppNameClean && pageAppNameClean === signalAppNameClean) {
                console.log(`[AppTracking] Starting monitoring for ${appName}`);
                startInstallMonitoring(appName, appId);
            }
        });
    }

    // --- 1. HANDLE DOWNLOAD CLICK (Unchanged) ---
    if (btnDownload) {
        btnDownload.addEventListener("click", () => {
            const user = auth.currentUser;
            if (user) {
                saveToHistory(user.uid, appId, appName, appIcon, "Downloading...");
            } else {
                showToast("Download started. Login for history tracking.");
            }
        });
    }

    // --- 2. LISTEN FOR AUTH & SYNC (Unchanged) ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            syncAppStatus(user, appId, appName, appIcon);
        } else {
            checkLocalOnly(appName);
        }
    });

    // --- CORE STATUS CHECK AND SYNC (Firebase Listener) ---
    async function syncAppStatus(user, appId, appName, appIcon) {
        const appRef = ref(db, `users/${user.uid}/history/${appId}`);

        // Realtime Listener
        onValue(appRef, async (snapshot) => {
            cachedFirebaseData = snapshot.val() || {};
            
            // Critical: Check system installed status immediately (Fixes Issue 2)
            const detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                // Case 1: Installed on Device
                updateUIInstalled(detectedPath); // Fixes Issue 4: Hide download, show update/uninstall
                
                // Final verification write to Firebase (Fixes Issue 1 & 3)
                const dbData = snapshot.val();
                if (!dbData || dbData.status !== 'installed' || dbData.installLocation !== detectedPath) {
                    saveFinalInstallState(user.uid, appId, detectedPath);
                }
            } else {
                // Case 2: Not detected locally
                updateUINotInstalled();
            }
        });
        
        // B. Handle Uninstall Click
        if (btnUninstall) {
            btnUninstall.onclick = (e) => {
                e.preventDefault();
                window.appAPI.uninstallApp(appName);
                
                update(ref(db, `users/${user.uid}/history/${appId}`), {
                    status: 'uninstalled',
                    installLocation: null,
                    lastChecked: Date.now()
                });
                showToast(`Uninstall signal sent for ${appName}.`);
            };
        }
    }

    // Polling function: CRITICAL FOR INSTALL VERIFICATION (Fixes Issues 1, 2, 3, 4)
    async function startInstallMonitoring(appName, appId) {
        if (isMonitoring) return;
        isMonitoring = true;
        let attempts = 0;
        const maxAttempts = 30; // Check every 2 seconds for 1 minute (Total 1 minute monitoring)
        const delay = 2000;
        const user = auth.currentUser;

        showToast(`Monitoring system for ${appName} installation...`);

        const poll = async () => {
            // Ensure API is ready
            if (!window.appAPI || !window.appAPI.findAppPath) {
                isMonitoring = false;
                return showToast("System API not available. Cannot verify install.");
            }
            
            const detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                // Installation confirmed!
                updateUIInstalled(detectedPath);
                
                if (user) {
                    saveFinalInstallState(user.uid, appId, detectedPath); // Fixes Issue 1 & 3
                }
                isMonitoring = false; // Stop monitoring
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(poll, delay);
            } else {
                isMonitoring = false;
                showToast(`${appName} installation verification timed out.`);
            }
        };

        poll();
    }


    // Helper: Check locally only (Anonymous User)
    async function checkLocalOnly(appName) {
        if (window.appAPI && window.appAPI.findAppPath) {
            const detectedPath = await window.appAPI.findAppPath(appName);
            if (detectedPath) {
                updateUIInstalled(detectedPath);
            } else {
                updateUINotInstalled();
            }
        }
    }

    // --- FIREBASE WRITE FUNCTIONS ---

    function saveToHistory(uid, id, name, icon, status) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        update(ref(db, `users/${uid}/history/${id}`), {
            appName: name, 
            appId: id, 
            icon: icon,
            timestamp: timestamp, 
            installedDate: dateString, 
            status: status || 'downloading'
        });
    }
    
    // CRITICAL FIX: Ensures installation location and status are written
    function saveFinalInstallState(uid, id, location) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        
        update(ref(db, `users/${uid}/history/${id}`), {
            status: 'installed',
            installLocation: location, // Fixes Issue 1 & 3
            timestamp: timestamp, 
            installedDate: dateString, // Fixes status date
            lastChecked: Date.now()
        });
        showToast("Installation verified and saved to history!");
    }


    // --- UI UPDATERS (Only runs if confirmed by findAppPath) ---
    // Fixes Bug 4 (UI buttons)
    function updateUIInstalled(location) {
        if (btnDownload) btnDownload.style.display = "none";
        if (btnUpdate) btnUpdate.style.display = "inline-flex"; 
        if (btnUninstall) btnUninstall.style.display = "inline-flex";

        if (statusText) {
            // Use date from Firebase if available, otherwise show 'Verified'
            const date = cachedFirebaseData.installedDate || "Verified";
            // Fixes Issue 2: Display correct installed date
            statusText.innerHTML = `<span style="color:#00e676; font-weight:bold;">${date}</span>`;
        }

        if (locLink) {
            locLink.innerText = location;
            locLink.title = location; 
        }
    }

    function updateUINotInstalled() {
        if (btnDownload) btnDownload.style.display = "inline-flex";
        if (btnUpdate) btnUpdate.style.display = "none";
        if (btnUninstall) btnUninstall.style.display = "none";
        
        if (statusText) statusText.innerText = "Not Installed";
        if (locLink) locLink.innerText = "—";
    }
});