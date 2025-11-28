/**
 * APP TRACKING - RESTRUCTURED
 * /scripts/app_tracking.js
 * Based on renderer.js logic with proper guest/logged-in handling
 */

import { mainAuth, mainDb } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { ref, update, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const showToast = (message) => {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(`[TOAST]: ${message}`);
};

// Helper: Clean app name for matching
function getCleanMatchName(rawName) {
    if (!rawName) return "";
    return rawName.toLowerCase()
        .replace(/ pc$/i, '')
        .replace(/ edition$/i, '')
        .replace(/ app$/i, '')
        .replace(/ software$/i, '')
        .replace(/[^a-z0-9]/g, '');
}

// Helper: Extract clean app name from filename
function getCleanAppName(filename) {
    if (!filename) return "App";
    let name = filename.replace(/\.(exe|msi|zip|rar|iso)$/i, '');
    let parts = name.split(/_| v\d/);
    let cleanName = parts[0] ? parts[0] : name;
    return cleanName.trim();
}

// Check if running in Electron
const isElectron = !!(window.appAPI && window.appAPI.findPath);

// Debug logging
const debugLog = {
    tracking: (message, data = null) => {
        console.log(`🎯 [Tracking] ${message}`, data || '');
    },
    sync: (message, data = null) => {
        console.log(`🔄 [Sync] ${message}`, data || '');
    },
    guest: (message) => {
        console.log(`👤 [Guest] ${message}`);
    }
};

// Smart app path finder with fallback names
async function smartFindAppPath(originalName, aggression = 5) {
    if (!isElectron || !window.appAPI.findPath) return null;

    debugLog.tracking('Searching for app:', originalName);

    // Try original name first
    let path = await window.appAPI.findPath(originalName, aggression);
    if (path) {
        debugLog.tracking('Found at:', path);
        return path;
    }

    // Try simplified name (remove PC, Edition, etc.)
    const simpleName = originalName
        .replace(/ PC$/i, "")
        .replace(/ Edition$/i, "")
        .replace(/ Software$/i, "")
        .replace(/ App$/i, "")
        .trim();
        
    if (simpleName !== originalName) {
        path = await window.appAPI.findPath(simpleName, aggression);
        if (path) {
            debugLog.tracking('Found with simplified name at:', path);
            return path;
        }
    }

    debugLog.tracking('App not found');
    return null;
}

// Get sync configuration from localStorage (from renderer.js)
function getSyncConfig() {
    return {
        enabled: localStorage.getItem('syncEnabled') === 'true',
        aggression: parseInt(localStorage.getItem('syncAggression') || '5')
    };
}

// =========================================================
// MAIN: VIEW PAGE LOGIC (Single App Tracking)
// =========================================================
export function initAppTracking() {
    debugLog.tracking('Initializing App Tracking (View Page)...');
    
    const appCard = document.querySelector('#app-card-root'); 
    if (!appCard || appCard.style.display === 'none') {
        debugLog.tracking('No app card found, skipping initialization');
        return;
    }

    const appId = appCard.dataset.app;
    const serverLastUpdated = appCard.getAttribute('data-last-updated') || "";
    const rawAppName = document.getElementById('d-app-title') ? document.getElementById('d-app-title').innerText : "Unknown App";
    const appIconImg = document.getElementById('d-app-image');
    const appIcon = appIconImg ? appIconImg.src : "";
    
    // UI Elements
    const btnDownload = document.getElementById('d-btn-download');
    const btnOpen = document.getElementById('d-btn-open');
    const btnUpdate = document.getElementById('d-btn-update');
    const btnUninstall = document.getElementById('d-btn-uninstall');
    const btnFav = document.getElementById('d-btn-fav');
    
    const statusText = document.getElementById('install-status-dynamic');
    const locLink = document.getElementById('loc-path-dynamic');
    
    let currentUser = null;
    let isFirebaseReady = false;
    let cachedFirebaseData = {};
    let pollInterval = null;

    debugLog.tracking('App details:', { appId, rawAppName, isElectron });

    // Initialize UI based on environment
    if (!isElectron) {
        // Browser: Always show only download button
        debugLog.guest('Browser environment - showing download only');
        updateUINotInstalled();
    } else {
        // Electron: Show download initially, will update based on auth
        debugLog.tracking('Electron environment - initializing...');
        updateUINotInstalled();
    }

    // --- HANDLE DOWNLOAD CLICK ---
    if (btnDownload) {
        if (!btnDownload.dataset.trackingAttached) {
            btnDownload.addEventListener("click", () => {
                debugLog.tracking('Download clicked');
                
                // Only save to history if logged in
                if (currentUser && !currentUser.isAnonymous && isFirebaseReady) {
                    saveToHistory(currentUser.uid, appId, rawAppName, appIcon, "Downloading");
                    showToast("Download started and saved to history");
                } else {
                    debugLog.guest('Download started (not saved - guest user)');
                    showToast("Download started. Login to track installation.");
                }
            });
            btnDownload.dataset.trackingAttached = "true";
        }
    }

    // --- HANDLE OPEN APP CLICK ---
    if (btnOpen && isElectron) {
        btnOpen.onclick = async () => {
            if (window.appAPI.openApp) {
                debugLog.tracking('Opening app:', rawAppName);
                let opened = await window.appAPI.openApp(rawAppName);
                
                if (!opened) {
                    // Try simplified name
                    const simpleName = rawAppName.replace(/ PC$/i, "").replace(/ Edition$/i, "").replace(/ Software$/i, "").trim();
                    debugLog.tracking('Retrying with simplified name:', simpleName);
                    opened = await window.appAPI.openApp(simpleName);
                }
                
                if (opened) {
                    showToast(`Opening ${rawAppName}...`);
                } else {
                    showToast("Failed to open app");
                }
            } else {
                showToast("Cannot open app: API missing");
            }
        };
    }

    // --- HANDLE UPDATE CLICK ---
    if (btnUpdate) {
        btnUpdate.onclick = () => {
            debugLog.tracking('Update clicked - redirecting to download');
            if (btnDownload) {
                btnDownload.click();
            }
        };
    }

    // --- HANDLE FAVORITES ---
    if (btnFav) {
        btnFav.onclick = async () => {
            if (!currentUser || currentUser.isAnonymous || !isFirebaseReady) {
                showToast("Please Login to add to favorites");
                return;
            }
            
            const favRef = ref(mainDb, `users/${currentUser.uid}/favorites/${appId}`);
            
            try {
                const snap = await get(favRef);
                
                if (snap.exists()) {
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
            } catch (error) {
                console.error('Favorites error:', error);
                showToast("Failed to update favorites");
            }
        };
    }
    
    function updateFavUI(isFav) {
        if (!btnFav) return;
        const icon = btnFav.querySelector('i');
        if (!icon) return;
        
        if (isFav) {
            btnFav.classList.add('active');
            icon.classList.remove('fa-regular');
            icon.classList.add('fa-solid');
        } else {
            btnFav.classList.remove('active');
            icon.classList.remove('fa-solid');
            icon.classList.add('fa-regular');
        }
    }

    // --- AUTH STATE HANDLING ---
    onAuthStateChanged(mainAuth, (user) => {
        debugLog.tracking('Auth state changed:', user ? user.email : 'Guest');
        
        if (user && !user.isAnonymous) {
            // Logged in user
            currentUser = user;
            isFirebaseReady = true;
            debugLog.tracking('User logged in, initializing sync');
            
            if (isElectron) {
                // Electron + Logged in: Full functionality
                syncAppStatus(user, appId, rawAppName);
                startPolling();
            } else {
                // Browser + Logged in: Sync status but limited UI
                syncAppStatusBrowser(user, appId);
            }
            
            // Sync favorites
            const favRef = ref(mainDb, `users/${user.uid}/favorites/${appId}`);
            onValue(favRef, (snap) => updateFavUI(snap.exists()), (error) => {
                console.error('Favorites sync error:', error);
            });
            
        } else {
            // Guest user
            debugLog.guest('Guest mode active');
            currentUser = null;
            isFirebaseReady = false;
            stopPolling();
            
            if (isElectron) {
                // Electron + Guest: Check local installation only
                checkLocalOnly(rawAppName);
            } else {
                // Browser + Guest: Show download only
                updateUINotInstalled();
            }
            
            updateFavUI(false);
        }
    });

    // --- ELECTRON INSTALL SIGNALS ---
    if (isElectron && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            debugLog.tracking('Install signal received:', data);
            
            const cleanPageName = getCleanMatchName(rawAppName);
            const signalAppNameClean = getCleanMatchName(data.appName || '');
            
            if (signalAppNameClean === cleanPageName) {
                debugLog.tracking('Install signal matches current app, starting monitoring');
                startInstallMonitoring(rawAppName, appId);
            }
        });
    }

    // --- CORE: SYNC APP STATUS (ELECTRON + LOGGED IN) ---
    async function syncAppStatus(user, appId, appName) {
        if (!isElectron) return;
        
        const historyRef = ref(mainDb, `users/${user.uid}/history`);
        const syncConfig = getSyncConfig();

        onValue(historyRef, async (snapshot) => {
            const allHistory = snapshot.val() || {};
            let myEntry = allHistory[appId];

            // Try to find entry by appId or by name matching
            if (!myEntry) {
                const targetName = getCleanMatchName(appName);
                const foundKey = Object.keys(allHistory).find(key => {
                    const item = allHistory[key];
                    const itemName = getCleanMatchName(item.appName || item.filename || '');
                    return itemName.includes(targetName) || targetName.includes(itemName);
                });
                if (foundKey) {
                    myEntry = allHistory[foundKey];
                    debugLog.sync('Found entry by name matching:', foundKey);
                }
            }

            cachedFirebaseData = myEntry || {};
            
            // Check actual local installation status
            let detectedPath = await smartFindAppPath(appName, syncConfig.aggression);

            if (detectedPath) {
                // App is installed locally
                const needsUpdate = !!(serverLastUpdated && 
                    cachedFirebaseData.installedDate && 
                    serverLastUpdated !== cachedFirebaseData.installedDate);
                
                updateUIInstalled(detectedPath, needsUpdate);
                
                // Sync to Firebase if status doesn't match
                if (!myEntry || myEntry.status !== 'Installed' || myEntry.installLocation !== detectedPath) {
                    debugLog.sync('Local app found, updating Firebase');
                    saveFinalInstallState(user.uid, appId, detectedPath, serverLastUpdated, rawAppName, appIcon);
                }
            } else {
                // App is not installed locally
                updateUINotInstalled();
                
                // If Firebase says installed but file is missing, update to uninstalled
                if (myEntry && myEntry.status === 'Installed') {
                    debugLog.sync('App missing locally, updating Firebase to Uninstalled');
                    update(ref(mainDb, `users/${user.uid}/history/${appId}`), {
                        status: 'Uninstalled',
                        installLocation: null,
                        lastChecked: Date.now()
                    }).catch(err => console.error('Firebase update error:', err));
                }
            }
        }, (error) => {
            console.error('Firebase sync error:', error);
        });

        // Setup uninstall handler
        setupUninstallHandler(user, appId, appName);
    }

    // --- BROWSER SYNC (LIMITED) ---
    async function syncAppStatusBrowser(user, appId) {
        const historyRef = ref(mainDb, `users/${user.uid}/history`);

        onValue(historyRef, async (snapshot) => {
            const allHistory = snapshot.val() || {};
            let myEntry = allHistory[appId];

            if (!myEntry) {
                const targetName = getCleanMatchName(rawAppName);
                const foundKey = Object.keys(allHistory).find(key => {
                    const item = allHistory[key];
                    const itemName = getCleanMatchName(item.appName || item.filename || '');
                    return itemName.includes(targetName) || targetName.includes(itemName);
                });
                if (foundKey) myEntry = allHistory[foundKey];
            }

            cachedFirebaseData = myEntry || {};
            
            // In browser, just show status from Firebase
            if (myEntry && myEntry.status === 'Installed') {
                const location = myEntry.installLocation || "On Desktop";
                if (statusText) {
                    const date = myEntry.installedDate || "Unknown";
                    statusText.innerHTML = `<span style="color:#00e676; font-weight:bold;">Installed (${date})</span>`;
                }
                if (locLink) {
                    locLink.innerText = location;
                    locLink.title = location;
                }
            } else {
                updateUINotInstalled();
            }
        }, (error) => {
            console.error('Browser sync error:', error);
        });
    }

    // --- CHECK LOCAL ONLY (GUEST MODE) ---
    async function checkLocalOnly(appName) {
        if (!isElectron) return;
        
        debugLog.guest('Checking local installation only');
        const syncConfig = getSyncConfig();
        let detectedPath = await smartFindAppPath(appName, syncConfig.aggression);

        if (detectedPath) {
            debugLog.guest('App found locally at:', detectedPath);
            updateUIInstalled(detectedPath, false);
        } else {
            debugLog.guest('App not found locally');
            updateUINotInstalled();
        }
    }

    // --- INSTALL MONITORING ---
    async function startInstallMonitoring(appName, appId) {
        let attempts = 0;
        const maxAttempts = 30;
        const delay = 2000;
        const syncConfig = getSyncConfig();

        showToast(`Installing ${appName}...`);
        debugLog.tracking('Starting install monitoring');

        const poll = async () => {
            if (!isElectron) return;
            
            let detectedPath = await smartFindAppPath(appName, syncConfig.aggression);

            if (detectedPath) {
                debugLog.tracking('Installation detected at:', detectedPath);
                updateUIInstalled(detectedPath, false);
                
                if (currentUser && !currentUser.isAnonymous && isFirebaseReady) {
                    saveFinalInstallState(currentUser.uid, appId, detectedPath, serverLastUpdated, rawAppName, appIcon);
                    showToast(`${appName} installed successfully!`);
                } else {
                    debugLog.guest('App installed but not synced (guest mode)');
                    showToast(`${appName} installed!`);
                }
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(poll, delay);
            } else {
                debugLog.tracking('Install monitoring timeout');
            }
        };
        
        poll();
    }

    // --- SETUP UNINSTALL HANDLER ---
    function setupUninstallHandler(user, appId, appName) {
        if (!btnUninstall || !isElectron) return;

        // Remove old listeners by cloning
        const newUninstall = btnUninstall.cloneNode(true);
        btnUninstall.parentNode.replaceChild(newUninstall, btnUninstall);
        
        // Update reference
        const uninstallBtn = document.getElementById('d-btn-uninstall');
        
        uninstallBtn.onclick = async (e) => {
            e.preventDefault();
            
            if (!window.appAPI.uninstallApp) {
                showToast("Uninstall API not available");
                return;
            }
            
            const simpleName = appName.replace(/ PC$/i, "").replace(/ Edition$/i, "").replace(/ Software$/i, "").trim();
            
            debugLog.tracking('Uninstalling:', simpleName);
            window.appAPI.uninstallApp(simpleName);
            
            // Update Firebase
            if (user && !user.isAnonymous) {
                update(ref(mainDb, `users/${user.uid}/history/${appId}`), {
                    status: 'Uninstalled',
                    installLocation: null,
                    lastChecked: Date.now()
                }).catch(err => console.error('Firebase uninstall update error:', err));
            }
            
            showToast(`Uninstall signal sent for ${appName}`);
            
            // Update UI immediately
            updateUINotInstalled();
        };
    }

    // --- POLLING FOR REAL-TIME UPDATES ---
    function startPolling() {
        if (pollInterval) return;
        
        debugLog.tracking('Starting status polling');
        pollInterval = setInterval(async () => {
            if (currentUser && !currentUser.isAnonymous && isElectron) {
                const syncConfig = getSyncConfig();
                const detectedPath = await smartFindAppPath(rawAppName, syncConfig.aggression);
                
                // Only update if status changed
                const currentlyShowingInstalled = btnOpen && btnOpen.style.display !== 'none';
                const actuallyInstalled = !!detectedPath;
                
                if (currentlyShowingInstalled !== actuallyInstalled) {
                    debugLog.tracking('Status changed, updating UI');
                    if (actuallyInstalled) {
                        updateUIInstalled(detectedPath, false);
                    } else {
                        updateUINotInstalled();
                    }
                }
            }
        }, 3000);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
            debugLog.tracking('Stopped status polling');
        }
    }

    // --- FIREBASE HELPERS ---
    function saveToHistory(uid, id, name, icon, status) {
        const timestamp = Date.now();
        debugLog.sync('Saving to history:', { uid, id, name, status });
        
        update(ref(mainDb, `users/${uid}/history/${id}`), {
            appName: name, 
            appId: id, 
            icon: icon, 
            timestamp: timestamp, 
            status: status || 'Downloading'
        }).catch((err) => console.error('Save history error:', err));
    }
    
    function saveFinalInstallState(uid, id, location, versionDate, name, icon) {
        const timestamp = Date.now();
        const dateString = versionDate || new Date(timestamp).toLocaleDateString();
        
        debugLog.sync('Saving install state:', { uid, id, location });
        
        update(ref(mainDb, `users/${uid}/history/${id}`), {
            appName: name,
            appId: id,
            icon: icon,
            status: 'Installed', 
            installLocation: location, 
            timestamp: timestamp, 
            installedDate: dateString,
            lastChecked: Date.now()
        }).catch((err) => console.error('Save install state error:', err));
    }

    // --- UI HELPERS ---
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
        
        debugLog.tracking('UI updated to: Installed');
    }

    function updateUINotInstalled() {
        const { dl, op, up, un } = getButtons();
        
        if (dl) dl.style.display = "inline-flex";
        if (op) op.style.display = "none";
        if (up) up.style.display = "none";
        if (un) un.style.display = "none";
        
        if (statusText) statusText.innerText = "Not Installed";
        if (locLink) {
            locLink.innerText = "—";
            locLink.title = "";
        }
        
        debugLog.tracking('UI updated to: Not Installed');
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopPolling();
    });
}

// =========================================================
// PROFILE PAGE SYNC (Background sync for all apps)
// =========================================================
export function initProfileSync() {
    if (!isElectron) {
        debugLog.guest('Profile sync skipped - not in Electron');
        return;
    }

    debugLog.sync('Initializing Profile Sync...');

    onAuthStateChanged(mainAuth, (user) => {
        if (user && !user.isAnonymous) {
            const historyRef = ref(mainDb, `users/${user.uid}/history`);
            const syncConfig = getSyncConfig();
            
            debugLog.sync('Starting background sync for all apps');
            
            // Sync all history items in background
            onValue(historyRef, async (snapshot) => {
                const history = snapshot.val();
                if (!history) return;

                debugLog.sync('Syncing', Object.keys(history).length, 'apps');

                for (const key in history) {
                    const item = history[key];
                    
                    // Skip if already marked as uninstalled
                    if (item.status === 'Uninstalled') continue;
                    
                    const appName = item.appName || item.filename;
                    if (!appName) continue;
                    
                    const detectedPath = await smartFindAppPath(appName, syncConfig.aggression);
                    
                    if (detectedPath && item.status !== 'Installed') {
                        // Found installed, update Firebase
                        debugLog.sync('Found installed app:', appName);
                        update(ref(mainDb, `users/${user.uid}/history/${key}`), {
                            status: 'Installed',
                            installLocation: detectedPath,
                            lastChecked: Date.now()
                        }).catch(err => console.error('Profile sync update error:', err));
                        
                    } else if (!detectedPath && item.status === 'Installed') {
                        // Previously installed but now missing
                        debugLog.sync('App no longer installed:', appName);
                        update(ref(mainDb, `users/${user.uid}/history/${key}`), {
                            status: 'Uninstalled',
                            installLocation: null,
                            lastChecked: Date.now()
                        }).catch(err => console.error('Profile sync update error:', err));
                    }
                }
            }, (error) => {
                console.error('Profile sync error:', error);
            });
        } else {
            debugLog.guest('Profile sync disabled - guest mode');
        }
    });
}

// =========================================================
// ROUTER - Auto-initialize based on page
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname;
    
    if (path.includes('view.html')) {
        debugLog.tracking('Detected view.html - initializing app tracking');
        initAppTracking();
    } else if (path.includes('profile.html')) {
        debugLog.sync('Detected profile.html - initializing profile sync');
        initProfileSync();
    } else {
        debugLog.tracking('Unknown page, skipping initialization');
    }
});