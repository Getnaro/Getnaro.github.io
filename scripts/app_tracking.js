/**
 * APP TRACKING - COMPLETE FIXED VERSION
 * /scripts/app_tracking.js
 * Logic:
 * - Browser: Only Download button visible
 * - Electron (Not Installed): Only Download button visible
 * - Electron (Installed): Download hidden, Open/Update/Uninstall/Favorites visible
 * - Update button: Grey if dates match, colored if update available
 * - Anyone can download, but tracking requires login (shows popup)
 */

import { mainAuth, mainDb } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { ref, update, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const showToast = (message) => {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(`[TOAST]: ${message}`);
};

// Helper: Prompt for login (Advertisement style)
const promptLogin = () => {
    if(confirm("🚀 Sign in to unlock Getnaro App features!\n\n✓ Track your downloads\n✓ Sync across devices\n✓ One-click open & uninstall\n✓ Save favorites\n\nWould you like to sign in now?")) {
        window.location.href = '/pages/login.html';
    }
};

function getCleanMatchName(rawName) {
    if (!rawName) return "";
    return rawName.toLowerCase()
        .replace(/ pc$/i, '')
        .replace(/ edition$/i, '')
        .replace(/ app$/i, '')
        .replace(/ software$/i, '')
        .replace(/[^a-z0-9]/g, '');
}

const isElectron = window.appAPI && window.appAPI.findAppPath;

async function smartFindAppPath(originalName) {
    if (!isElectron) return null;

    let path = await window.appAPI.findAppPath(originalName);
    if (path) return path;

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

// =========================================================
// 1. VIEW PAGE LOGIC (Single App)
// =========================================================
export function initAppTracking() {
    console.log("Initializing App Tracking (View Page)...");
    
    const appCard = document.querySelector('#app-card-root'); 
    if (!appCard || appCard.style.display === 'none') return;

    const appId = appCard.dataset.app;
    
    if (!appId) {
        console.warn("App ID missing. Waiting for data load...");
        return;
    }

    const serverLastUpdated = appCard.getAttribute('data-last-updated') || "";
    const rawAppName = document.getElementById('d-app-title') ? document.getElementById('d-app-title').innerText : "Unknown App";
    const appIconImg = document.getElementById('d-app-image');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    // Elements
    const btnDownload = document.getElementById('d-btn-download');
    const btnOpen = document.getElementById('d-btn-open');
    const btnUpdate = document.getElementById('d-btn-update');
    const btnUninstall = document.getElementById('d-btn-uninstall');
    const btnFav = document.getElementById('d-btn-fav');
    
    const statusText = document.getElementById('install-status-dynamic');
    const locLink = document.getElementById('loc-path-dynamic');
    
    let cachedFirebaseData = {};
    let currentUser = null;

    // --- INITIAL STATE: BROWSER OR ELECTRON NOT INSTALLED ---
    if (!isElectron) {
        // Browser: Only download button
        updateUINotInstalled();
    } else {
        // Electron: Start with download button, check local after
        updateUINotInstalled();
    }

    // --- 1. HANDLE DOWNLOAD CLICK (No login required, just optional tracking) ---
    if (btnDownload) {
        const newBtn = btnDownload.cloneNode(true);
        btnDownload.parentNode.replaceChild(newBtn, btnDownload);
        
        newBtn.addEventListener("click", () => {
            const user = mainAuth.currentUser;
            // Anyone can download, but only logged-in users get tracking
            if (user && !user.isAnonymous) {
                saveToHistory(user.uid, appId, rawAppName, appIcon, "Downloading");
                showToast("Download started & tracked!");
            } else {
                showToast("Download started.");
            }
        });
    }

    // --- 2. HANDLE OPEN CLICK (Requires login) ---
    if (btnOpen && isElectron) {
        const newOpen = btnOpen.cloneNode(true);
        btnOpen.parentNode.replaceChild(newOpen, btnOpen);
        
        newOpen.onclick = async () => {
            const user = mainAuth.currentUser;
            if(!user || user.isAnonymous) {
                promptLogin();
                return;
            }
            
            if(window.appAPI.openApp) {
                let opened = await window.appAPI.openApp(rawAppName);
                if (!opened) {
                    const simpleName = rawAppName.replace(/ PC$/i, "").replace(/ Edition$/i, "");
                    opened = await window.appAPI.openApp(simpleName);
                }
                if(opened) showToast(`Opening ${rawAppName}...`);
            } else {
                showToast("Cannot open app: API missing.");
            }
        };
    }

    // --- 3. HANDLE UPDATE CLICK (Requires login) ---
    if (btnUpdate) {
        const newUpdate = btnUpdate.cloneNode(true);
        btnUpdate.parentNode.replaceChild(newUpdate, btnUpdate);
        
        newUpdate.onclick = () => {
            const user = mainAuth.currentUser;
            if(!user || user.isAnonymous) {
                promptLogin();
                return;
            }
            
            // Redirect to download link (same as download button)
            const dlBtn = document.getElementById('d-btn-download');
            if(dlBtn && dlBtn.href) {
                window.open(dlBtn.href, '_blank');
                showToast("Downloading update...");
            }
        };
    }

    // --- 4. HANDLE FAVORITES (Requires login) ---
    if (btnFav) {
        const newFavBtn = btnFav.cloneNode(true);
        btnFav.parentNode.replaceChild(newFavBtn, btnFav);

        newFavBtn.onclick = async () => {
            const user = mainAuth.currentUser;
            
            if(!user || user.isAnonymous) {
                promptLogin();
                return;
            }
            
            newFavBtn.style.pointerEvents = "none";

            try {
                const favRef = ref(mainDb, `users/${user.uid}/favorites/${appId}`);
                const snap = await get(favRef);
                
                if(snap.exists()) {
                    await remove(favRef);
                    updateFavUI(false); 
                    showToast("Removed from favorites");
                } else {
                    await set(favRef, {
                        appName: rawAppName,
                        appId: appId,
                        icon: appIcon,
                        timestamp: Date.now()
                    });
                    updateFavUI(true);
                    showToast("Added to favorites");
                }
            } catch (err) {
                console.error("Fav Error:", err);
                showToast("Error updating favorites");
            } finally {
                newFavBtn.style.pointerEvents = "auto";
            }
        };
    }
    
    function updateFavUI(isFav) {
        const targetBtn = document.getElementById('d-btn-fav');
        if(!targetBtn) return;
        
        const icon = targetBtn.querySelector('i');
        if (!icon) return;

        if(isFav) {
            targetBtn.classList.add('active');
            icon.classList.remove('fa-regular');
            icon.classList.add('fa-solid');
            icon.style.color = "#ff4757";
        } else {
            targetBtn.classList.remove('active');
            icon.classList.remove('fa-solid');
            icon.classList.add('fa-regular');
            icon.style.color = "";
        }
    }

    // --- 5. AUTH STATE & SYNC ---
    onAuthStateChanged(mainAuth, (user) => {
        currentUser = user;

        if (user && !user.isAnonymous) {
            // User is signed in: Enable tracking and check favorites
            syncAppStatus(user, appId, rawAppName);
            
            // Set up listener for favorites button state
            const favRef = ref(mainDb, `users/${user.uid}/favorites/${appId}`);
            onValue(favRef, (snap) => {
                updateFavUI(snap.exists());
            });

        } else {
            // User NOT signed in:
            // 1. Reset Favorite UI
            updateFavUI(false);
            
            // 2. If Electron, check local status (just for UI, no DB sync)
            if (isElectron) {
                checkLocalOnlyNoTracking(rawAppName);
            } else {
                updateUINotInstalled();
            }
        }
    });

    // --- 6. ELECTRON INSTALL SIGNALS ---
    if (isElectron && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            const cleanPageName = getCleanMatchName(rawAppName);
            const signalAppNameClean = getCleanMatchName(data.appName);
            if (signalAppNameClean === cleanPageName) {
                startInstallMonitoring(rawAppName, appId);
            }
        });
    }

    // --- CORE LOGIC: SYNC STATUS (Only for logged-in users) ---
    async function syncAppStatus(user, appId, appName) {
        if (!user || user.isAnonymous) return;

        const historyRef = ref(mainDb, `users/${user.uid}/history`);

        onValue(historyRef, async (snapshot) => {
            const allHistory = snapshot.val() || {};
            let myEntry = allHistory[appId];

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
                // Browser: Check DB only
                if (myEntry && (myEntry.status && myEntry.status.toLowerCase() === 'installed')) {
                    updateUIInstalled(myEntry.installLocation || "On Desktop", false);
                } else {
                    updateUINotInstalled();
                }
                return;
            }

            // ELECTRON: Check Real Local Status
            let detectedPath = await smartFindAppPath(appName);

            if (detectedPath) {
                // App is installed locally
                const installedDate = cachedFirebaseData.installedDate || "";
                const needsUpdate = (serverLastUpdated && installedDate && serverLastUpdated !== installedDate);
                
                updateUIInstalled(detectedPath, needsUpdate); 

                // If DB says uninstalled/downloading but it IS installed locally, update DB
                if (!myEntry || myEntry.status !== 'Installed' || myEntry.installLocation !== detectedPath) {
                    saveFinalInstallState(user.uid, appId, detectedPath, serverLastUpdated);
                }
            } else {
                // Not installed locally
                updateUINotInstalled();

                // If DB says "Installed" but file is missing, downgrade to Uninstalled
                if (myEntry && (myEntry.status === 'Installed' || myEntry.status === 'installed')) {
                    console.log("App missing locally. Updating DB to Uninstalled...");
                    update(ref(mainDb, `users/${user.uid}/history/${appId}`), {
                        status: 'Uninstalled',
                        installLocation: null,
                        lastChecked: Date.now()
                    });
                }
            }
        });

        // --- UNINSTALL BUTTON (Requires login, already checked in syncAppStatus call) ---
        const currentUninstall = document.getElementById('d-btn-uninstall');
        if (currentUninstall && isElectron) {
            const newUninstall = currentUninstall.cloneNode(true);
            currentUninstall.parentNode.replaceChild(newUninstall, currentUninstall);

            newUninstall.onclick = (e) => {
                e.preventDefault();
                
                if (window.appAPI.uninstallApp) {
                    const simpleName = appName.replace(/ PC$/i, "").replace(/ Edition$/i, "");
                    window.appAPI.uninstallApp(simpleName);
                    
                    update(ref(mainDb, `users/${user.uid}/history/${appId}`), {
                        status: 'Uninstalled',
                        installLocation: null,
                        lastChecked: Date.now()
                    });
                    showToast(`Uninstall signal sent for ${appName}`);
                }
            };
        }
    }

    // --- Install Monitoring (After download in Electron) ---
    async function startInstallMonitoring(appName, appId) {
        let isMonitoring = true;
        let attempts = 0;
        const maxAttempts = 30; 
        const delay = 2000;
        const user = mainAuth.currentUser;

        showToast(`Installing ${appName}...`);

        const poll = async () => {
            if (!isElectron) { isMonitoring = false; return; }
            
            let detectedPath = await smartFindAppPath(appName);

            if (detectedPath) {
                const needsUpdate = false; // Fresh install, no update needed
                updateUIInstalled(detectedPath, needsUpdate); 
                
                if (user && !user.isAnonymous) {
                    saveFinalInstallState(user.uid, appId, detectedPath, serverLastUpdated); 
                }
                isMonitoring = false;
                showToast(`${appName} installed successfully!`);
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(poll, delay);
            } else {
                isMonitoring = false;
                showToast("Installation monitoring timed out");
            }
        };
        poll();
    }

    // --- Local Check (Guest users in Electron, UI only, no DB) ---
    async function checkLocalOnlyNoTracking(appName) {
        if (!isElectron) return;
        let detectedPath = await smartFindAppPath(appName);

        if (detectedPath) {
            // Show installed UI but buttons require login
            updateUIInstalledButNoAccess(detectedPath);
        } else {
            updateUINotInstalled();
        }
    }

    // --- Database Helpers ---
    function saveToHistory(uid, id, name, icon, status) {
        const timestamp = Date.now();
        update(ref(mainDb, `users/${uid}/history/${id}`), {
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
        update(ref(mainDb, `users/${uid}/history/${id}`), {
            status: 'Installed', 
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
            op: document.getElementById('d-btn-open'),
            up: document.getElementById('d-btn-update'),
            un: document.getElementById('d-btn-uninstall'),
            fav: document.getElementById('d-btn-fav')
        };
    };

    function updateUIInstalled(location, needsUpdate) {
        const { dl, op, up, un, fav } = getButtons();
        
        // Hide download, show others
        if (dl) dl.style.display = "none";
        if (op) op.style.display = "inline-flex";
        if (un) un.style.display = "inline-flex";
        if (fav) fav.style.display = "inline-flex";
        
        // Update button logic
        if (up) {
            up.style.display = "inline-flex";
            
            if (needsUpdate) {
                // Update available - colored button
                up.style.opacity = "1";
                up.style.filter = "none";
                up.style.cursor = "pointer";
                up.disabled = false;
                up.title = "Update Available";
            } else {
                // No update - grey button
                up.style.opacity = "0.4";
                up.style.filter = "grayscale(100%)";
                up.style.cursor = "not-allowed";
                up.disabled = true;
                up.title = "Already up to date";
            }
        }

        // Update status text
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

    function updateUIInstalledButNoAccess(location) {
        const { dl, op, up, un, fav } = getButtons();
        
        // Show all buttons but they'll prompt login
        if (dl) dl.style.display = "none";
        if (op) op.style.display = "inline-flex";
        if (up) up.style.display = "none"; // Hide update for guests
        if (un) un.style.display = "inline-flex";
        if (fav) fav.style.display = "inline-flex";

        if (statusText) {
            statusText.innerHTML = `<span style="color:#ffa726; font-weight:bold;">Installed (Sign in to manage)</span>`;
        }

        if (locLink) {
            locLink.innerText = location;
            locLink.title = "Sign in to access features"; 
        }
    }

    function updateUINotInstalled() {
        const { dl, op, up, un, fav } = getButtons();
        
        // Only download button visible
        if (dl) dl.style.display = "inline-flex";
        if (op) op.style.display = "none";
        if (up) up.style.display = "none";
        if (un) un.style.display = "none";
        
        // Fav button visible but requires login
        if (fav) fav.style.display = "inline-flex";
        
        if (statusText) statusText.innerText = "Not Installed";
        if (locLink) locLink.innerText = "—";
    }

    // --- Aggressive polling for View Page (Only for logged-in users) ---
    setInterval(() => {
        if(window.location.pathname.includes('view.html')) {
            const user = mainAuth.currentUser;
            if(user && !user.isAnonymous && isElectron) {
                syncAppStatus(user, appId, rawAppName);
            }
        }
    }, 5000);
}

// =========================================================
// 2. PROFILE PAGE SYNC LOGIC (Run on profile.html)
// =========================================================
export function initProfileSync() {
    if (!isElectron) return;

    onAuthStateChanged(mainAuth, (user) => {
        if (user && !user.isAnonymous) {
            const historyRef = ref(mainDb, `users/${user.uid}/history`);
            
            onValue(historyRef, async (snapshot) => {
                const history = snapshot.val();
                if (!history) return;

                for (const key in history) {
                    const item = history[key];
                    if (item.status !== 'Uninstalled') {
                        const appName = item.appName || item.filename;
                        const detectedPath = await smartFindAppPath(appName);
                        
                        if (detectedPath && item.status !== 'Installed') {
                            update(ref(mainDb, `users/${user.uid}/history/${key}`), {
                                status: 'Installed',
                                installLocation: detectedPath,
                                lastChecked: Date.now()
                            });
                        } else if (!detectedPath && (item.status === 'Installed' || item.status === 'installed')) {
                            update(ref(mainDb, `users/${user.uid}/history/${key}`), {
                                status: 'Uninstalled',
                                installLocation: null,
                                lastChecked: Date.now()
                            });
                        }
                    }
                }
            }); 
        }
    });
}

// =========================================================
// 3. ROUTER
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    if (window.location.pathname.includes('profile.html')) {
        initProfileSync();
    }
});