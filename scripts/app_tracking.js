import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, update, onValue } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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
    const appCard = document.querySelector('.content-one');
    if (!appCard) {
        console.warn("App Tracking: No .content-one element found.");
        return;
    }

    const appId = appCard.dataset.app;
    const rawAppName = appCard.querySelector('h1') ? appCard.querySelector('h1').textContent.trim() : "Unknown App";
    const appName = rawAppName;
    const appIconImg = appCard.querySelector('.gn-card-left img');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    const btnDownload = appCard.querySelector('.gn-btn-download');
    const btnUpdate = appCard.querySelector('.gn-btn-update');
    const btnUninstall = appCard.querySelector('.gn-btn-uninstall');
    
    const statusText = appCard.querySelector('[id^="install-status"]');
    const locLink = appCard.querySelector('.fs-loc-link');
    
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
                version: appCard.querySelector('.fs-stats p')?.innerText || "N/A", 
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

    // --- 1. HANDLE DOWNLOAD CLICK ---
    if (btnDownload) {
        // Remove old listeners to prevent duplicates if re-initialized
        const newBtn = btnDownload.cloneNode(true);
        btnDownload.parentNode.replaceChild(newBtn, btnDownload);
        
        newBtn.addEventListener("click", () => {
            const user = auth.currentUser;
            if (user) {
                saveToHistory(user.uid, appId, appName, appIcon, "Downloading...");
            } else {
                showToast("Download started. Login for history tracking.");
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
        const appRef = ref(db, `users/${user.uid}/history/${appId}`);

        onValue(appRef, async (snapshot) => {
            cachedFirebaseData = snapshot.val() || {};
            const detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                updateUIInstalled(detectedPath); 
                const dbData = snapshot.val();
                if (!dbData || dbData.status !== 'installed' || dbData.installLocation !== detectedPath) {
                    saveFinalInstallState(user.uid, appId, detectedPath);
                }
            } else {
                updateUINotInstalled();
            }
        });
        
        if (btnUninstall) {
            // Remove old listeners
            const newUninstall = btnUninstall.cloneNode(true);
            btnUninstall.parentNode.replaceChild(newUninstall, btnUninstall);

            newUninstall.onclick = (e) => {
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
                return showToast("System API not available.");
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
                showToast(`${appName} installation verification timed out.`);
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

    function saveToHistory(uid, id, name, icon, status) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        update(ref(db, `users/${uid}/history/${id}`), {
            appName: name, appId: id, icon: icon, timestamp: timestamp, installedDate: dateString, status: status || 'downloading'
        });
    }
    
    function saveFinalInstallState(uid, id, location) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        update(ref(db, `users/${uid}/history/${id}`), {
            status: 'installed', installLocation: location, timestamp: timestamp, installedDate: dateString, lastChecked: Date.now()
        });
    }

    // --- UI UPDATERS ---
    const getButtons = () => {
        // Re-query buttons in case they were replaced
        return {
            dl: document.querySelector('.gn-btn-download'),
            up: document.querySelector('.gn-btn-update'),
            un: document.querySelector('.gn-btn-uninstall')
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

// Auto-run on legacy static pages
document.addEventListener("DOMContentLoaded", () => {
    // Only auto-run if we are NOT on the dynamic view.html page
    // (view.html will call it manually after fetching data)
    if (!window.location.pathname.includes('view.html')) {
        initAppTracking();
    }
});