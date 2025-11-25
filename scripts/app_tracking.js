import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, update, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Configuration (Your specific keys) ---
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
    const appCard = document.querySelector('#app-card-root'); 
    if (!appCard || appCard.style.display === 'none') {
        console.warn("App Tracking: App card not visible or not found.");
        return;
    }

    const appId = appCard.dataset.app;
    // Get the date string stored in view.html from Firestore
    const serverLastUpdated = appCard.getAttribute('data-last-updated') || "";
    
    const rawAppName = document.getElementById('d-app-title') ? document.getElementById('d-app-title').innerText : "Unknown App";
    const appName = rawAppName;
    const appIconImg = document.getElementById('d-app-image');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    // Buttons
    const btnDownload = document.getElementById('d-btn-download');
    const btnOpen = document.getElementById('d-btn-open'); // NEW
    const btnUpdate = document.getElementById('d-btn-update');
    const btnUninstall = document.getElementById('d-btn-uninstall');
    const btnFav = document.getElementById('d-btn-fav'); // NEW FAV
    
    const statusText = document.getElementById('install-status-dynamic');
    const locLink = document.getElementById('loc-path-dynamic');
    
    let isMonitoring = false;
    let cachedFirebaseData = {};
    const cleanPageName = getCleanPageAppName(rawAppName); 

    // --- 0. ELECTRON CHECK (Mobile Handling) ---
    const isElectron = window.appAPI && window.appAPI.findAppPath;

    // --- 1. HANDLE DOWNLOAD CLICK (Syncs History) ---
    if (btnDownload) {
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

    // --- 2. HANDLE OPEN CLICK (Electron Only) ---
    if (btnOpen && isElectron) {
        btnOpen.onclick = async () => {
             if(window.appAPI.openApp) {
                 window.appAPI.openApp(appName);
             } else {
                 showToast("Cannot open app: API missing.");
             }
        };
    }

    // --- 3. HANDLE FAVORITES ---
    if (btnFav) {
        // Handle Fav Click
        btnFav.onclick = async () => {
            const user = auth.currentUser;
            if(!user) return showToast("Login to add favorites.");
            
            const favRef = ref(db, `users/${user.uid}/favorites/${appId}`);
            // Check current state
            const snap = await get(favRef);
            if(snap.exists()) {
                // Remove
                await remove(favRef);
                updateFavUI(false);
                showToast("Removed from favorites");
            } else {
                // Add
                await set(favRef, {
                    appName: appName,
                    appId: appId,
                    icon: appIcon,
                    timestamp: Date.now()
                });
                updateFavUI(true);
                showToast("Added to favorites");
            }
        };
    }
    
    function updateFavUI(isFav) {
        if(!btnFav) return;
        const icon = btnFav.querySelector('i');
        if(isFav) {
            btnFav.classList.add('active');
            icon.classList.remove('fa-regular');
            icon.classList.add('fa-solid');
        } else {
            btnFav.classList.remove('active');
            icon.classList.remove('fa-solid');
            icon.classList.add('fa-regular');
        }
    }

    // --- 4. LISTEN FOR AUTH & SYNC ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            syncAppStatus(user, appId, appName, appIcon);
            // Sync Favorites
            const favRef = ref(db, `users/${user.uid}/favorites/${appId}`);
            onValue(favRef, (snap) => updateFavUI(snap.exists()));
        } else {
            // Not logged in, but we still check local installed status if Electron
            if (isElectron) {
                checkLocalOnly(appName);
            } else {
                // Mobile/Web Guest: Default to Download view
                updateUINotInstalled();
            }
        }
    });

    // --- 5. SIGNAL HANDLERS (ELECTRON) ---
    if (isElectron && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            const signalAppNameClean = getCleanPageAppName(data.appName);
            if (signalAppNameClean && cleanPageName === signalAppNameClean) {
                console.log(`[AppTracking] Starting monitoring for ${appName}`);
                startInstallMonitoring(appName, appId);
            }
        });
    }

    // --- CORE SYNC FUNCTION ---
    async function syncAppStatus(user, appId, appName, appIcon) {
        const appRef = ref(db, `users/${user.uid}/history/${appId}`);

        onValue(appRef, async (snapshot) => {
            cachedFirebaseData = snapshot.val() || {};
            
            // IF NOT ELECTRON (Mobile/Browser), Just show download unless logic changes
            if (!isElectron) {
                // On mobile, we can't detect install, so we mostly show Download
                // If you want to show "Installed" purely based on account history on mobile, use this:
                // if (cachedFirebaseData.status === 'installed') { ... } 
                // BUT user requested: "on mobile browser must still show the download always"
                updateUINotInstalled(); 
                return;
            }

            // ELECTRON DETECTED
            let detectedPath = null;
            detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                // It is installed locally.
                const dbData = snapshot.val();
                
                // Compare Dates for Update
                // Server Date: serverLastUpdated (from DOM)
                // User Date: cachedFirebaseData.installedDate (from DB)
                // Logic: If mismatch, assume update needed (or check if server date is "newer" if formats allow)
                // Simple mismatch check:
                const needsUpdate = (serverLastUpdated && cachedFirebaseData.installedDate && serverLastUpdated !== cachedFirebaseData.installedDate);

                updateUIInstalled(detectedPath, needsUpdate); 

                // Sync DB if needed (e.g. if DB says uninstalled but local found it)
                if (!dbData || dbData.status !== 'installed' || dbData.installLocation !== detectedPath) {
                    saveFinalInstallState(user.uid, appId, detectedPath, serverLastUpdated); // Save current server date as installed date
                }
            } else {
                updateUINotInstalled();
            }
        });

        // Hook up Uninstall Button
        if (btnUninstall && isElectron) {
            const newUninstall = btnUninstall.cloneNode(true);
            btnUninstall.parentNode.replaceChild(newUninstall, btnUninstall);

            newUninstall.onclick = (e) => {
                e.preventDefault();
                if (window.appAPI.uninstallApp) {
                    window.appAPI.uninstallApp(appName);
                    update(ref(db, `users/${user.uid}/history/${appId}`), {
                        status: 'uninstalled',
                        installLocation: null,
                        lastChecked: Date.now()
                    });
                    showToast(`Uninstall signal sent.`);
                }
            };
        }
    }

    async function startInstallMonitoring(appName, appId) {
        if (isMonitoring) return;
        isMonitoring = true;
        let attempts = 0;
        const maxAttempts = 30; 
        const delay = 2000;
        const user = auth.currentUser;

        showToast(`Installing ${appName}...`);

        const poll = async () => {
            if (!isElectron) { isMonitoring = false; return; }
            
            const detectedPath = await window.appAPI.findAppPath(appName);

            if (detectedPath) {
                // Installed!
                // When freshly installed, the "installedDate" becomes the current server date
                updateUIInstalled(detectedPath, false); 
                if (user) {
                    saveFinalInstallState(user.uid, appId, detectedPath, serverLastUpdated); 
                }
                isMonitoring = false; 
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(poll, delay);
            } else {
                isMonitoring = false;
            }
        };
        poll();
    }

    async function checkLocalOnly(appName) {
        if (!isElectron) return;
        const detectedPath = await window.appAPI.findAppPath(appName);
        if (detectedPath) {
            updateUIInstalled(detectedPath, false); // Guest mode, can't check update mismatch easily without DB
        } else {
            updateUINotInstalled();
        }
    }

    function saveToHistory(uid, id, name, icon, status) {
        const timestamp = Date.now();
        // dateString acts as the 'Version' or 'Date' key for updates
        const dateString = serverLastUpdated || new Date(timestamp).toLocaleDateString(); 
        
        update(ref(db, `users/${uid}/history/${id}`), {
            appName: name, 
            appId: id, 
            icon: icon, 
            timestamp: timestamp, 
            status: status || 'downloading'
            // We don't set installedDate yet, only on finish
        }).catch((err) => console.error(err));
    }
    
    function saveFinalInstallState(uid, id, location, versionDate) {
        const timestamp = Date.now();
        // Use the SERVER date as the installed proof
        const dateString = versionDate || new Date(timestamp).toLocaleDateString();
        
        update(ref(db, `users/${uid}/history/${id}`), {
            status: 'installed', 
            installLocation: location, 
            timestamp: timestamp, 
            installedDate: dateString, // Important for mismatch check later
            lastChecked: Date.now()
        });
    }

    // --- UI UPDATERS ---
    const getButtons = () => {
        return {
            dl: document.getElementById('d-btn-download'),
            op: document.getElementById('d-btn-open'),
            up: document.getElementById('d-btn-update'),
            un: document.getElementById('d-btn-uninstall')
        };
    };

    function updateUIInstalled(location, needsUpdate) {
        const { dl, op, up, un } = getButtons();
        
        // Hide Download
        if (dl) dl.style.display = "none";
        
        // Show Open
        if (op) op.style.display = "inline-flex";

        // Logic: Show Update IF needsUpdate is true
        if (up) up.style.display = needsUpdate ? "inline-flex" : "none";
        
        // Show Uninstall
        if (un) un.style.display = "inline-flex";

        if (statusText) {
            const date = cachedFirebaseData.installedDate || "Verified";
            statusText.innerHTML = `<span style="color:#00e676; font-weight:bold;">Installed (${date})</span>`;
        }

        if (locLink) {
            locLink.innerText = location;
            locLink.title = location; 
            locLink.href = "#"; 
        }
    }

    function updateUINotInstalled() {
        const { dl, op, up, un } = getButtons();
        // Standard State
        if (dl) dl.style.display = "inline-flex";
        if (op) op.style.display = "none";
        if (up) up.style.display = "none";
        if (un) un.style.display = "none";
        
        if (statusText) statusText.innerText = "Not Installed";
        if (locLink) locLink.innerText = "—";
    }
}

// Auto-run if not on view page (legacy support), otherwise view.html triggers it
document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.pathname.includes('view.html')) {
        initAppTracking();
    }
});