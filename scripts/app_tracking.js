import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, update, onValue } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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

document.addEventListener("DOMContentLoaded", () => {
    // --- APP CARD SETUP ---
    const appCard = document.querySelector('.content-one');
    if (!appCard) return;

    const appId = appCard.dataset.app;
    // The canonical name for registry searching, taken from H1
    const appName = appCard.querySelector('h1') ? appCard.querySelector('h1').textContent.trim() : "Unknown App";
    const appIconImg = appCard.querySelector('.gn-card-left img');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    const btnDownload = appCard.querySelector('.gn-btn-download');
    const btnUpdate = appCard.querySelector('.gn-btn-update');
    const btnUninstall = appCard.querySelector('.gn-btn-uninstall');
    
    const statusText = document.getElementById(`install-status-${appId.split('-')[0]}`) || appCard.querySelector('[id^="install-status"]');
    const locLink = document.getElementById(`loc-path-${appId.split('-')[0]}`) || appCard.querySelector('.fs-loc-link');
    
    let isMonitoring = false;

    // --- NEW: Listen for INSTALL START signal from parent renderer ---
    if (window.appAPI && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            // Check if the received appName matches the app on this page
            if (data.appName && data.appName.toLowerCase().includes(appName.toLowerCase().split(/\W/)[0])) {
                startInstallMonitoring(appName, appId);
            }
        });
    }

    // --- 1. HANDLE DOWNLOAD CLICK (ALLOWS DOWNLOAD, TRACKS IF LOGGED IN) ---
    if (btnDownload) {
        btnDownload.addEventListener("click", () => {
            const user = auth.currentUser;
            if (user) {
                // Initial tracking for download start
                saveToHistory(user.uid, appId, appName, appIcon, "Downloading...");
            } else {
                if(window.showToast) window.showToast("Download started. Login for history tracking.");
            }
        });
    }

    // --- 2. LISTEN FOR AUTH & SYNC ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            syncAppStatus(user, appId, appName, appIcon);
        } else {
            // Anonymous check on load
            checkLocalOnly(appName);
        }
    });

    // --- CORE STATUS CHECK AND SYNC ---

    async function syncAppStatus(user, appId, appName, appIcon) {
        const appRef = ref(db, `users/${user.uid}/history/${appId}`);

        // A. Realtime Listener for Firebase data
        onValue(appRef, async (snapshot) => {
            
            // The UI state is always governed by the local system check
            const detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                // Case 1: Installed on Device
                updateUIInstalled(detectedPath);
                
                // FINAL STEP: Update Firebase with confirmed installed state and location
                // Only write if we have new data to save or status is incorrect
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
                if (window.appAPI && window.appAPI.openUninstallSettings) {
                    window.appAPI.openUninstallSettings();
                } else if(window.showToast) {
                    window.showToast("Please use Windows Settings to uninstall this app.");
                }
            };
        }
    }

    // Polling function: CRITICAL FOR INSTALL VERIFICATION
    async function startInstallMonitoring(appName, appId) {
        if (isMonitoring) return;
        isMonitoring = true;
        let attempts = 0;
        const maxAttempts = 30; // Check every 2 seconds for 1 minute
        const delay = 2000;
        const user = auth.currentUser;

        if (window.showToast) window.showToast(`Monitoring system for ${appName} installation...`);

        const poll = async () => {
            const detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                console.log(`Installation found after ${attempts} attempts.`);
                updateUIInstalled(detectedPath);
                
                // If logged in, save the definitive status to the server immediately
                if (user) {
                    saveFinalInstallState(user.uid, appId, detectedPath);
                }
                isMonitoring = false; // Stop monitoring
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(poll, delay);
            } else {
                console.log("Monitoring stopped. App not found after 1 minute.");
                isMonitoring = false;
                if (window.showToast) window.showToast(`${appName} not found. Check if installation was successful.`);
            }
        };

        if (window.appAPI && window.appAPI.findAppPath) {
            poll();
        }
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
    
    // NEW: Save the final, confirmed install state
    function saveFinalInstallState(uid, id, location) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        
        update(ref(db, `users/${uid}/history/${id}`), {
            status: 'installed',
            installLocation: location,
            timestamp: timestamp, 
            installedDate: dateString,
            lastChecked: Date.now()
        });
        console.log("Firebase updated: App installed with location.");
        if (window.showToast) window.showToast("Installation verified and saved to history!");
    }


    // --- UI UPDATERS (Only runs if confirmed by findAppPath) ---

    function updateUIInstalled(location) {
        if (btnDownload) btnDownload.style.display = "none";
        if (btnUpdate) btnUpdate.style.display = "inline-flex"; 
        if (btnUninstall) btnUninstall.style.display = "inline-flex";

        if (statusText) {
            statusText.innerHTML = `<span style="color:#00e676; font-weight:bold;"><i class="fa-solid fa-check-circle"></i> Installed</span>`;
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