import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, update, onValue } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Configuration (Updated with your keys) ---
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

// Helper to get a consistent, cleaned app name for matching
function getCleanPageAppName(rawName) {
    if (!rawName) return null;
    const parts = rawName.toUpperCase().split(/[\W_]/).filter(Boolean);
    return parts.length > 0 ? parts[0] : null; 
}

// --- MAIN TRACKING FUNCTION (EXPORTED) ---
export function initAppTracking() {
    console.log("Initializing App Tracking...");
    
    // --- APP CARD SETUP ---
    // We target the dynamic content created in view.html
    const appCard = document.querySelector('#app-card-root'); // Targeting the specific ID from view.html is safer
    if (!appCard || appCard.style.display === 'none') {
        console.warn("App Tracking: App card not visible or not found.");
        return;
    }

    const appId = appCard.dataset.app;
    const rawAppName = document.getElementById('d-app-title') ? document.getElementById('d-app-title').innerText : "Unknown App";
    const appName = rawAppName;
    const appIconImg = document.getElementById('d-app-image');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    // Select buttons inside the dynamic card
    const btnDownload = document.getElementById('d-btn-download');
    const btnUpdate = document.getElementById('d-btn-update');
    const btnUninstall = document.getElementById('d-btn-uninstall');
    
    const statusText = document.getElementById('install-status-dynamic');
    const locLink = document.getElementById('loc-path-dynamic');
    
    let isMonitoring = false;
    let cachedFirebaseData = {};
    const cleanPageName = getCleanPageAppName(rawAppName); 

    // --- NEW: App Info Retrieval Hook ---
    if (window.appAPI && window.appAPI.getAppInfo) {
        window.appAPI.getAppInfo = async () => {
            const detectedPath = await window.appAPI.findAppPath(appName);
            const status = detectedPath ? "Installed" : "Not Installed";
            
            return {
                appName: appName,
                publisher: "Getnaro Team", 
                version: document.getElementById('d-app-version')?.innerText || "N/A", 
                platform: "Windows Desktop", 
                accountStatus: auth.currentUser ? "Logged In" : "Logged Out",
                installedDate: cachedFirebaseData.installedDate || status,
                storageSpace: "Unknown", 
            };
        };
    }

    // --- CRITICAL FIX: Listen for INSTALL START signal ---
    if (window.appAPI && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            const signalAppNameClean = getCleanPageAppName(data.appName);
            if (signalAppNameClean && cleanPageName === signalAppNameClean) {
                console.log(`[AppTracking] Starting monitoring for ${appName}`);
                startInstallMonitoring(appName, appId);
            }
        });
    }

    // --- 1. HANDLE DOWNLOAD CLICK (Syncs History) ---
    if (btnDownload) {
        // Clone to remove old listeners
        const newBtn = btnDownload.cloneNode(true);
        btnDownload.parentNode.replaceChild(newBtn, btnDownload);
        
        newBtn.addEventListener("click", () => {
            const user = auth.currentUser;
            if (user) {
                console.log("Saving download to history for:", user.uid);
                saveToHistory(user.uid, appId, appName, appIcon, "Downloading...");
            } else {
                showToast("Download started. Login to save history.");
            }
        });
    }

    // --- 2. LISTEN FOR AUTH & SYNC ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            syncAppStatus(user, appId, appName, appIcon);
        } else {
            checkLocalOnly(appName);
        }
    });

    // --- CORE STATUS CHECK AND SYNC ---
    async function syncAppStatus(user, appId, appName, appIcon) {
        // Syncs with: users/{uid}/history/{appId}
        const appRef = ref(db, `users/${user.uid}/history/${appId}`);

        onValue(appRef, async (snapshot) => {
            cachedFirebaseData = snapshot.val() || {};
            
            // Check desktop local status
            let detectedPath = null;
            if (window.appAPI && window.appAPI.findAppPath) {
                detectedPath = await window.appAPI.findAppPath(appName);
            }

            if (detectedPath) {
                updateUIInstalled(detectedPath); 
                const dbData = snapshot.val();
                // If DB says not installed but local IS installed, update DB
                if (!dbData || dbData.status !== 'installed' || dbData.installLocation !== detectedPath) {
                    saveFinalInstallState(user.uid, appId, detectedPath);
                }
            } else {
                // If DB says installed, but local is NOT, we keep DB as record (history) 
                // but UI shows not installed locally.
                updateUINotInstalled();
            }
        });
        
        if (btnUninstall) {
            const newUninstall = btnUninstall.cloneNode(true);
            btnUninstall.parentNode.replaceChild(newUninstall, btnUninstall);

            newUninstall.onclick = (e) => {
                e.preventDefault();
                if (window.appAPI) {
                    window.appAPI.uninstallApp(appName);
                    // Update DB to reflect uninstall
                    update(ref(db, `users/${user.uid}/history/${appId}`), {
                        status: 'uninstalled',
                        installLocation: null,
                        lastChecked: Date.now()
                    });
                    showToast(`Uninstall signal sent for ${appName}.`);
                }
            };
        }
    }

    // Polling function
    async function startInstallMonitoring(appName, appId) {
        if (isMonitoring) return;
        isMonitoring = true;
        let attempts = 0;
        const maxAttempts = 30; 
        const delay = 2000;
        const user = auth.currentUser;

        showToast(`Monitoring system for ${appName} installation...`);

        const poll = async () => {
            if (!window.appAPI || !window.appAPI.findAppPath) {
                isMonitoring = false;
                return;
            }
            
            const detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                updateUIInstalled(detectedPath);
                if (user) {
                    saveFinalInstallState(user.uid, appId, detectedPath); 
                }
                isMonitoring = false; 
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(poll, delay);
            } else {
                isMonitoring = false;
                // Timeout silently
            }
        };
        poll();
    }

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

    // --- HISTORY SAVING LOGIC (The part that updates Profile) ---
    function saveToHistory(uid, id, name, icon, status) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        // Writes to the exact path Profile.js listens to
        update(ref(db, `users/${uid}/history/${id}`), {
            appName: name, 
            appId: id, 
            icon: icon, 
            timestamp: timestamp, 
            installedDate: dateString, 
            status: status || 'downloading'
        }).then(() => {
            console.log("History updated successfully.");
        }).catch((err) => {
            console.error("Failed to save history:", err);
        });
    }
    
    function saveFinalInstallState(uid, id, location) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        update(ref(db, `users/${uid}/history/${id}`), {
            status: 'installed', 
            installLocation: location, 
            timestamp: timestamp, 
            installedDate: dateString, 
            lastChecked: Date.now()
        });
    }

    // --- UI UPDATERS ---
    const getButtons = () => {
        return {
            dl: document.getElementById('d-btn-download'),
            up: document.getElementById('d-btn-update'),
            un: document.getElementById('d-btn-uninstall')
        };
    };

    function updateUIInstalled(location) {
        const { dl, up, un } = getButtons();
        if (dl) dl.style.display = "none";
        if (up) up.style.display = "inline-flex"; 
        if (un) un.style.display = "inline-flex";

        if (statusText) {
            const date = cachedFirebaseData.installedDate || "Verified";
            statusText.innerHTML = `<span style="color:#00e676; font-weight:bold;">${date}</span>`;
        }

        if (locLink) {
            locLink.innerText = location;
            locLink.title = location; 
            locLink.href = "#"; // Prevent navigation
        }
    }

    function updateUINotInstalled() {
        const { dl, up, un } = getButtons();
        if (dl) dl.style.display = "inline-flex";
        if (up) up.style.display = "none";
        if (un) un.style.display = "none";
        
        if (statusText) statusText.innerText = "Not Installed";
        if (locLink) locLink.innerText = "—";
    }
}

// Auto-run logic:
// We ONLY auto-run if we are NOT on view.html, to allow view.html to call it manually when ready.
document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.pathname.includes('view.html')) {
        initAppTracking();
    }
});