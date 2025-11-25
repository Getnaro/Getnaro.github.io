import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, update, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

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

// --- SAFE INITIALIZATION ---
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getDatabase(app);

const showToast = (message) => {
    if (typeof window.showToast === 'function') {
        window.showToast(message);
    } else {
        console.log(`[TOAST]: ${message}`);
    }
};

// Helper to strip "PC", "Edition", etc for matching
function getCleanMatchName(rawName) {
    if (!rawName) return "";
    return rawName.toLowerCase()
        .replace(/ pc$/i, '')
        .replace(/ edition$/i, '')
        .replace(/ app$/i, '')
        .replace(/ software$/i, '')
        .replace(/[^a-z0-9]/g, ''); // "cpu-z" -> "cpuz"
}

function getCleanPageAppName(rawName) {
    if (!rawName) return null;
    const parts = rawName.toUpperCase().split(/[\W_]/).filter(Boolean);
    return parts.length > 0 ? parts[0] : null; 
}

// --- MAIN TRACKING FUNCTION ---
export function initAppTracking() {
    console.log("Initializing App Tracking...");
    
    const appCard = document.querySelector('#app-card-root'); 
    if (!appCard || appCard.style.display === 'none') return;

    const appId = appCard.dataset.app;
    const serverLastUpdated = appCard.getAttribute('data-last-updated') || "";
    const rawAppName = document.getElementById('d-app-title') ? document.getElementById('d-app-title').innerText : "Unknown App";
    const appName = rawAppName;
    const appIconImg = document.getElementById('d-app-image');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    // Buttons
    const btnDownload = document.getElementById('d-btn-download');
    const btnOpen = document.getElementById('d-btn-open');
    const btnUpdate = document.getElementById('d-btn-update');
    const btnUninstall = document.getElementById('d-btn-uninstall');
    const btnFav = document.getElementById('d-btn-fav');
    
    const statusText = document.getElementById('install-status-dynamic');
    const locLink = document.getElementById('loc-path-dynamic');
    
    let isMonitoring = false;
    let cachedFirebaseData = {};
    const cleanPageName = getCleanPageAppName(rawAppName); 

    // --- ELECTRON CHECK ---
    const isElectron = window.appAPI && window.appAPI.findAppPath;

    // --- HELPER: SMART FIND PATH ---
    // Tries multiple variations of the name to find the app in Electron
    async function smartFindAppPath(originalName) {
        if (!isElectron) return null;

        // 1. Try Exact Name (e.g., "CPU-Z PC")
        let path = await window.appAPI.findAppPath(originalName);
        if (path) return path;

        // 2. Try Cleaning Common Suffixes (e.g., "CPU-Z")
        const simpleName = originalName
            .replace(/ PC$/i, "")
            .replace(/ Edition$/i, "")
            .replace(/ Software$/i, "")
            .replace(/ App$/i, "");
            
        if (simpleName !== originalName) {
            path = await window.appAPI.findAppPath(simpleName);
            if (path) return path;
        }

        return null;
    }

    // --- 1. HANDLE DOWNLOAD CLICK ---
    if (btnDownload) {
        if (!btnDownload.dataset.trackingAttached) {
            btnDownload.addEventListener("click", () => {
                const user = auth.currentUser;
                if (user && !user.isAnonymous) {
                    saveToHistory(user.uid, appId, appName, appIcon, "Downloading");
                } else {
                    showToast("Download started. Login to save history.");
                }
            });
            btnDownload.dataset.trackingAttached = "true";
        }
    }

    // --- 2. HANDLE OPEN CLICK ---
    if (btnOpen && isElectron) {
        btnOpen.onclick = async () => {
             if(window.appAPI.openApp) {
                 // Try smart opening
                 let opened = await window.appAPI.openApp(appName);
                 if (!opened) {
                     const simpleName = appName.replace(/ PC$/i, "").replace(/ Edition$/i, "");
                     window.appAPI.openApp(simpleName);
                 }
             } else {
                 showToast("Cannot open app: API missing.");
             }
        };
    }

    // --- 3. HANDLE FAVORITES ---
    if (btnFav) {
        btnFav.onclick = async () => {
            const user = auth.currentUser;
            if(!user || user.isAnonymous) {
                return showToast("Please Login to add to favorites.");
            }
            
            const favRef = ref(db, `users/${user.uid}/favorites/${appId}`);
            const snap = await get(favRef);
            
            if(snap.exists()) {
                await remove(favRef);
                updateFavUI(false);
                showToast("Removed from favorites");
            } else {
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

    // --- 4. AUTH STATE & SYNC ---
    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            syncAppStatus(user, appId, appName, appIcon);
            const favRef = ref(db, `users/${user.uid}/favorites/${appId}`);
            onValue(favRef, (snap) => updateFavUI(snap.exists()));
        } else {
            if (isElectron) {
                checkLocalOnly(appName);
            } else {
                updateUINotInstalled();
            }
            updateFavUI(false);
        }
    });

    // --- 5. ELECTRON SIGNALS ---
    if (isElectron && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            const signalAppNameClean = getCleanPageAppName(data.appName);
            if (signalAppNameClean && cleanPageName === signalAppNameClean) {
                startInstallMonitoring(appName, appId);
            }
        });
    }

    // --- CORE LOGIC: SYNC STATUS ---
    async function syncAppStatus(user, appId, appName, appIcon) {
        const historyRef = ref(db, `users/${user.uid}/history`);

        onValue(historyRef, async (snapshot) => {
            const allHistory = snapshot.val() || {};
            
            // 1. Direct Match
            let myEntry = allHistory[appId];

            // 2. Fuzzy Match
            if (!myEntry) {
                const targetName = getCleanMatchName(appName);
                const foundKey = Object.keys(allHistory).find(key => {
                    const item = allHistory[key];
                    const itemName = getCleanMatchName(item.appName || item.filename);
                    return itemName.includes(targetName) || targetName.includes(itemName);
                });
                if (foundKey) myEntry = allHistory[foundKey];
            }

            cachedFirebaseData = myEntry || {};
            
            if (!isElectron) {
                if (myEntry && (myEntry.status && myEntry.status.toLowerCase() === 'installed')) {
                    updateUIInstalled(myEntry.location || "On Desktop", false);
                } else {
                    updateUINotInstalled();
                }
                return;
            }

            // ELECTRON: Check Real Local Status using Smart Search
            let detectedPath = await smartFindAppPath(appName);

            if (detectedPath) {
                const needsUpdate = (serverLastUpdated && cachedFirebaseData.installedDate && serverLastUpdated !== cachedFirebaseData.installedDate);
                updateUIInstalled(detectedPath, needsUpdate); 

                if (!myEntry || myEntry.status !== 'Installed' || myEntry.installLocation !== detectedPath) {
                    saveFinalInstallState(user.uid, appId, detectedPath, serverLastUpdated);
                }
            } else {
                updateUINotInstalled();
            }
        });

        // Uninstall Hook
        if (btnUninstall && isElectron) {
            const newUninstall = btnUninstall.cloneNode(true);
            btnUninstall.parentNode.replaceChild(newUninstall, btnUninstall);

            newUninstall.onclick = (e) => {
                e.preventDefault();
                if (window.appAPI.uninstallApp) {
                    const simpleName = appName.replace(/ PC$/i, "").replace(/ Edition$/i, "");
                    window.appAPI.uninstallApp(simpleName);
                    
                    update(ref(db, `users/${user.uid}/history/${appId}`), {
                        status: 'Uninstalled',
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
            
            // Use Smart Search here too
            let detectedPath = await smartFindAppPath(appName);

            if (detectedPath) {
                updateUIInstalled(detectedPath, false); 
                if (user && !user.isAnonymous) {
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
        let detectedPath = await smartFindAppPath(appName);

        if (detectedPath) {
            updateUIInstalled(detectedPath, false);
        } else {
            updateUINotInstalled();
        }
    }

    function saveToHistory(uid, id, name, icon, status) {
        const timestamp = Date.now();
        update(ref(db, `users/${uid}/history/${id}`), {
            appName: name, 
            appId: id, 
            icon: icon, 
            timestamp: timestamp, 
            status: status || 'Downloading'
        }).catch((err) => console.error(err));
    }
    
    function saveFinalInstallState(uid, id, location, versionDate) {
        const timestamp = Date.now();
        const dateString = versionDate || new Date(timestamp).toLocaleDateString();
        update(ref(db, `users/${uid}/history/${id}`), {
            status: 'Installed', 
            installLocation: location, 
            timestamp: timestamp, 
            installedDate: dateString,
            lastChecked: Date.now()
        });
    }

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
        if (dl) dl.style.display = "none";
        if (op) op.style.display = "inline-flex";
        if (up) up.style.display = needsUpdate ? "inline-flex" : "none";
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
        if (dl) dl.style.display = "inline-flex";
        if (op) op.style.display = "none";
        if (up) up.style.display = "none";
        if (un) un.style.display = "none";
        
        if (statusText) statusText.innerText = "Not Installed";
        if (locLink) locLink.innerText = "—";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.pathname.includes('view.html')) {
        initAppTracking();
    }
});