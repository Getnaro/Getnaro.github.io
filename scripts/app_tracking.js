/**
 * APP TRACKING - COMPLETE FIXED VERSION
 * /scripts/app_tracking.js
 * 
 * Requirements:
 * 1. Browser + Guest: Download only, NO Firebase
 * 2. Electron + Guest: Download only, local checks, NO Firebase
 * 3. Electron + Logged In: Full functionality (Open/Uninstall/Update)
 * 4. Firebase only connects for logged-in users
 */

import { mainAuth, mainDb } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { ref, update, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// ============================================
// HELPERS
// ============================================

const showToast = (message) => {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(`[TOAST]: ${message}`);
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

function getCleanAppName(filename) {
    if (!filename) return "App";
    let name = filename.replace(/\.(exe|msi|zip|rar|iso)$/i, '');
    let parts = name.split(/_| v\d/);
    let cleanName = parts[0] ? parts[0] : name;
    return cleanName.trim();
}

const isElectron = !!(window.appAPI && window.appAPI.findPath);

const debugLog = {
    tracking: (message, data = null) => {
        console.log(`🎯 [Tracking] ${message}`, data || '');
    },
    sync: (message, data = null) => {
        console.log(`🔄 [Sync] ${message}`, data || '');
    },
    guest: (message) => {
        console.log(`👤 [Guest] ${message}`);
    },
    auth: (message, data = null) => {
        console.log(`🔐 [Auth] ${message}`, data || '');
    }
};

async function smartFindAppPath(originalName, aggression = 5) {
    if (!isElectron || !window.appAPI.findPath) return null;

    debugLog.tracking('Searching for app:', originalName);

    let path = await window.appAPI.findPath(originalName, aggression);
    if (path) {
        debugLog.tracking('✅ Found at:', path);
        return path;
    }

    const simpleName = originalName
        .replace(/ PC$/i, "")
        .replace(/ Edition$/i, "")
        .replace(/ Software$/i, "")
        .replace(/ App$/i, "")
        .trim();
        
    if (simpleName !== originalName) {
        path = await window.appAPI.findPath(simpleName, aggression);
        if (path) {
            debugLog.tracking('✅ Found with simplified name at:', path);
            return path;
        }
    }

    debugLog.tracking('❌ App not found');
    return null;
}

function getSyncConfig() {
    return {
        enabled: localStorage.getItem('syncEnabled') === 'true',
        aggression: parseInt(localStorage.getItem('syncAggression') || '5')
    };
}

// ============================================
// MAIN: VIEW PAGE LOGIC
// ============================================
export function initAppTracking() {
    debugLog.tracking('🚀 Initializing App Tracking...');
    
    const appCard = document.querySelector('#app-card-root'); 
    if (!appCard || appCard.style.display === 'none') {
        debugLog.tracking('❌ No app card found, skipping');
        return;
    }

    const appId = appCard.dataset.app;
    const serverLastUpdated = appCard.getAttribute('data-last-updated') || "";
    const rawAppName = document.getElementById('d-app-title')?.innerText || "Unknown App";
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
    
    // State
    let currentUser = null;
    let isFirebaseReady = false;
    let cachedFirebaseData = {};
    let pollInterval = null;
    let firebaseUnsubscribe = null;

    debugLog.tracking('📋 App details:', { appId, rawAppName, isElectron });

    // ============================================
    // DETERMINE ENVIRONMENT
    // ============================================
    const getEnvironment = () => {
        if (!isElectron) {
            return 'browser'; // Always guest in browser
        }
        return currentUser && !currentUser.isAnonymous ? 'electron-logged' : 'electron-guest';
    };

    debugLog.tracking('🌍 Environment:', getEnvironment());

    // ============================================
    // UI UPDATE FUNCTIONS
    // ============================================
    const getButtons = () => ({
        dl: btnDownload,
        op: btnOpen,
        up: btnUpdate,
        un: btnUninstall
    });

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
        
        debugLog.tracking('🎨 UI: Not Installed');
    }

    function updateUIInstalled(location, needsUpdate = false) {
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
        }
        
        debugLog.tracking('🎨 UI: Installed', { location, needsUpdate });
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

    // ============================================
    // DOWNLOAD HANDLER (Works for all modes)
    // ============================================
    if (btnDownload && !btnDownload.dataset.trackingAttached) {
        btnDownload.addEventListener("click", () => {
            debugLog.tracking('📥 Download clicked');
            
            const env = getEnvironment();
            
            if (env === 'electron-logged' && isFirebaseReady) {
                saveToHistory(currentUser.uid, appId, rawAppName, appIcon, "Downloading");
                showToast("Download started - Tracking enabled");
            } else {
                debugLog.guest('Download started (no tracking - guest mode)');
                showToast("Download started. Login to track installation.");
            }
        });
        btnDownload.dataset.trackingAttached = "true";
    }

    // ============================================
    // OPEN APP HANDLER (Electron only)
    // ============================================
    if (btnOpen && isElectron) {
        btnOpen.onclick = async () => {
            if (!window.appAPI.openApp) {
                showToast("Open app API not available");
                return;
            }
            
            debugLog.tracking('🚀 Opening app:', rawAppName);
            let opened = await window.appAPI.openApp(rawAppName);
            
            if (!opened) {
                const simpleName = rawAppName.replace(/ PC$/i, "").replace(/ Edition$/i, "").trim();
                debugLog.tracking('🔄 Retrying with simplified name:', simpleName);
                opened = await window.appAPI.openApp(simpleName);
            }
            
            if (opened) {
                showToast(`Opening ${rawAppName}...`);
            } else {
                showToast("Failed to open app");
            }
        };
    }

    // ============================================
    // UPDATE HANDLER
    // ============================================
    if (btnUpdate) {
        btnUpdate.onclick = () => {
            debugLog.tracking('🔄 Update clicked');
            if (btnDownload) btnDownload.click();
        };
    }

    // ============================================
    // UNINSTALL HANDLER (Electron + Logged in only)
    // ============================================
    function setupUninstallHandler(user) {
        if (!btnUninstall || !isElectron) return;

        const newUninstall = btnUninstall.cloneNode(true);
        btnUninstall.parentNode.replaceChild(newUninstall, btnUninstall);
        
        const uninstallBtn = document.getElementById('d-btn-uninstall');
        if (!uninstallBtn) return;
        
        uninstallBtn.onclick = async (e) => {
            e.preventDefault();
            
            if (!window.appAPI.uninstallApp) {
                showToast("Uninstall API not available");
                return;
            }
            
            const simpleName = rawAppName.replace(/ PC$/i, "").replace(/ Edition$/i, "").trim();
            
            debugLog.tracking('🗑️ Uninstalling:', simpleName);
            window.appAPI.uninstallApp(simpleName);
            
            if (user && !user.isAnonymous && isFirebaseReady) {
                update(ref(mainDb, `users/${user.uid}/history/${appId}`), {
                    status: 'Uninstalled',
                    installLocation: null,
                    lastChecked: Date.now()
                }).catch(err => console.error('Firebase uninstall update error:', err));
            }
            
            showToast(`Uninstall signal sent for ${rawAppName}`);
            updateUINotInstalled();
        };
    }

    // ============================================
    // FAVORITES HANDLER (Logged in only)
    // ============================================
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

    // ============================================
    // FIREBASE HELPERS
    // ============================================
    function saveToHistory(uid, id, name, icon, status) {
        if (!isFirebaseReady) return;
        
        const timestamp = Date.now();
        debugLog.sync('💾 Saving to history:', { id, name, status });
        
        update(ref(mainDb, `users/${uid}/history/${id}`), {
            appName: name, 
            appId: id, 
            icon: icon, 
            timestamp: timestamp, 
            status: status || 'Downloading'
        }).catch((err) => console.error('Save history error:', err));
    }
    
    function saveFinalInstallState(uid, id, location, versionDate, name, icon) {
        if (!isFirebaseReady) return;
        
        const timestamp = Date.now();
        const dateString = versionDate || new Date(timestamp).toLocaleDateString();
        
        debugLog.sync('💾 Saving install state:', { id, location });
        
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

    // ============================================
    // CORE: CHECK LOCAL ONLY (Guest Mode)
    // ============================================
    async function checkLocalOnly() {
        if (!isElectron) {
            debugLog.guest('Browser mode - showing download only');
            updateUINotInstalled();
            return;
        }
        
        debugLog.guest('🔍 Checking local installation (Guest mode)');
        const syncConfig = getSyncConfig();
        const detectedPath = await smartFindAppPath(rawAppName, syncConfig.aggression);

        if (detectedPath) {
            debugLog.guest('✅ App found locally:', detectedPath);
            updateUIInstalled(detectedPath, false);
        } else {
            debugLog.guest('❌ App not found locally');
            updateUINotInstalled();
        }
    }

    // ============================================
    // CORE: SYNC APP STATUS (Logged In + Electron)
    // ============================================
    async function syncAppStatus(user) {
        if (!isElectron || !isFirebaseReady) return;
        
        debugLog.sync('🔄 Starting Firebase sync for:', rawAppName);
        
        const historyRef = ref(mainDb, `users/${user.uid}/history`);
        const syncConfig = getSyncConfig();

        // Set up real-time Firebase listener
        firebaseUnsubscribe = onValue(historyRef, async (snapshot) => {
            const allHistory = snapshot.val() || {};
            let myEntry = allHistory[appId];

            // Try to find by app name if not found by ID
            if (!myEntry) {
                const targetName = getCleanMatchName(rawAppName);
                const foundKey = Object.keys(allHistory).find(key => {
                    const item = allHistory[key];
                    const itemName = getCleanMatchName(item.appName || item.filename || '');
                    return itemName.includes(targetName) || targetName.includes(itemName);
                });
                if (foundKey) {
                    myEntry = allHistory[foundKey];
                    debugLog.sync('📦 Found entry by name matching:', foundKey);
                }
            }

            cachedFirebaseData = myEntry || {};
            
            // Check actual local installation
            const detectedPath = await smartFindAppPath(rawAppName, syncConfig.aggression);

            if (detectedPath) {
                // App IS installed locally
                const needsUpdate = !!(serverLastUpdated && 
                    cachedFirebaseData.installedDate && 
                    serverLastUpdated !== cachedFirebaseData.installedDate);
                
                updateUIInstalled(detectedPath, needsUpdate);
                
                // Sync to Firebase if status doesn't match
                if (!myEntry || myEntry.status !== 'Installed' || myEntry.installLocation !== detectedPath) {
                    debugLog.sync('📤 Local app found, updating Firebase');
                    saveFinalInstallState(user.uid, appId, detectedPath, serverLastUpdated, rawAppName, appIcon);
                }
            } else {
                // App is NOT installed locally
                updateUINotInstalled();
                
                // If Firebase says installed but file missing, mark as uninstalled
                if (myEntry && myEntry.status === 'Installed') {
                    debugLog.sync('📤 App missing locally, updating Firebase');
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

        setupUninstallHandler(user);
    }

    // ============================================
    // POLLING (Works for both guest and logged-in)
    // ============================================
    function startPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
        }
        
        if (!isElectron) {
            debugLog.tracking('⏸️ Polling skipped - not in Electron');
            return;
        }
        
        const env = getEnvironment();
        debugLog.tracking(`🔄 Starting polling (${env} mode)`);
        
        pollInterval = setInterval(async () => {
            const syncConfig = getSyncConfig();
            const detectedPath = await smartFindAppPath(rawAppName, syncConfig.aggression);
            
            const currentlyShowingInstalled = btnOpen && btnOpen.style.display !== 'none';
            const actuallyInstalled = !!detectedPath;
            
            if (currentlyShowingInstalled !== actuallyInstalled) {
                debugLog.tracking('🔄 Status changed:', {
                    was: currentlyShowingInstalled ? 'Installed' : 'Not Installed',
                    now: actuallyInstalled ? 'Installed' : 'Not Installed'
                });
                
                if (actuallyInstalled) {
                    const needsUpdate = !!(serverLastUpdated && 
                        cachedFirebaseData.installedDate && 
                        serverLastUpdated !== cachedFirebaseData.installedDate);
                    
                    updateUIInstalled(detectedPath, needsUpdate);
                    
                    // Update Firebase if logged in
                    if (currentUser && !currentUser.isAnonymous && isFirebaseReady) {
                        saveFinalInstallState(
                            currentUser.uid, 
                            appId, 
                            detectedPath, 
                            serverLastUpdated, 
                            rawAppName, 
                            appIcon
                        );
                    }
                } else {
                    updateUINotInstalled();
                    
                    // Update Firebase if logged in
                    if (currentUser && !currentUser.isAnonymous && isFirebaseReady) {
                        update(ref(mainDb, `users/${currentUser.uid}/history/${appId}`), {
                            status: 'Uninstalled',
                            installLocation: null,
                            lastChecked: Date.now()
                        }).catch(err => console.error('Polling update error:', err));
                    }
                }
            }
        }, 5000); // Poll every 5 seconds
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
            debugLog.tracking('⏹️ Polling stopped');
        }
    }

    // ============================================
    // AUTH STATE MANAGEMENT
    // ============================================
    function handleUserChange(user) {
        debugLog.auth('👤 User change detected:', user ? user.email : 'Guest');
        
        // Clean up previous state
        stopPolling();
        if (firebaseUnsubscribe) {
            firebaseUnsubscribe();
            firebaseUnsubscribe = null;
        }
        
        if (user && !user.isAnonymous) {
            // LOGGED IN USER
            currentUser = user;
            isFirebaseReady = true;
            
            debugLog.auth('✅ Logged in:', user.email);
            
            if (isElectron) {
                debugLog.auth('🖥️ Electron + Logged in: Full sync enabled');
                syncAppStatus(user);
                startPolling();
            } else {
                debugLog.auth('🌐 Browser + Logged in: Limited functionality');
                // In browser, just show download (no local checks possible)
                updateUINotInstalled();
            }
            
            // Sync favorites
            const favRef = ref(mainDb, `users/${user.uid}/favorites/${appId}`);
            onValue(favRef, (snap) => updateFavUI(snap.exists()), (error) => {
                console.error('Favorites sync error:', error);
            });
            
        } else {
            // GUEST USER
            currentUser = null;
            isFirebaseReady = false;
            
            debugLog.guest('👤 Guest mode active');
            
            if (isElectron) {
                debugLog.guest('🖥️ Electron + Guest: Local checks only');
                checkLocalOnly();
                startPolling(); // Still poll for local changes
            } else {
                debugLog.guest('🌐 Browser + Guest: Download only');
                updateUINotInstalled();
            }
            
            updateFavUI(false);
        }
    }

    // ============================================
    // INITIAL AUTH DETECTION
    // ============================================
    debugLog.auth('🔍 Setting up auth detection...');
    
    // Set up Firebase auth listener
    onAuthStateChanged(mainAuth, handleUserChange);
    
    // Also check immediately (in case auth is already loaded)
    setTimeout(() => {
        const immediateUser = mainAuth.currentUser;
        if (immediateUser) {
            debugLog.auth('⚡ Immediate auth check found user:', immediateUser.email);
            handleUserChange(immediateUser);
        }
    }, 500);

    // ============================================
    // INSTALL MONITORING (Electron only)
    // ============================================
    if (isElectron && window.appAPI.onInstallStartSignal) {
        window.appAPI.onInstallStartSignal((data) => {
            debugLog.tracking('📡 Install signal received:', data);
            
            const cleanPageName = getCleanMatchName(rawAppName);
            const signalAppNameClean = getCleanMatchName(data.appName || '');
            
            const isMatch = signalAppNameClean === cleanPageName || 
                            signalAppNameClean.includes(cleanPageName) ||
                            cleanPageName.includes(signalAppNameClean);
            
            if (isMatch) {
                debugLog.tracking('✅ Install signal matched!');
                startInstallMonitoring();
            } else {
                debugLog.tracking('❌ Install signal mismatch:', {
                    signal: signalAppNameClean,
                    page: cleanPageName
                });
            }
        });
    }

    async function startInstallMonitoring() {
        let attempts = 0;
        const maxAttempts = 30;
        const delay = 2000;
        const syncConfig = getSyncConfig();

        showToast(`Installing ${rawAppName}...`);
        debugLog.tracking('🔄 Starting install monitoring');

        const poll = async () => {
            if (!isElectron) return;
            
            const detectedPath = await smartFindAppPath(rawAppName, syncConfig.aggression);

            if (detectedPath) {
                debugLog.tracking('✅ Installation detected at:', detectedPath);
                updateUIInstalled(detectedPath, false);
                
                if (currentUser && !currentUser.isAnonymous && isFirebaseReady) {
                    saveFinalInstallState(currentUser.uid, appId, detectedPath, serverLastUpdated, rawAppName, appIcon);
                    showToast(`${rawAppName} installed successfully!`);
                } else {
                    debugLog.guest('App installed but not synced (guest mode)');
                    showToast(`${rawAppName} installed!`);
                }
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(poll, delay);
            } else {
                debugLog.tracking('⏱️ Install monitoring timeout');
            }
        };
        
        poll();
    }

    // ============================================
    // CLEANUP
    // ============================================
    window.addEventListener('beforeunload', () => {
        stopPolling();
        if (firebaseUnsubscribe) {
            firebaseUnsubscribe();
        }
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

    debugLog.sync('🚀 Initializing Profile Sync...');

    onAuthStateChanged(mainAuth, (user) => {
        if (user && !user.isAnonymous) {
            const historyRef = ref(mainDb, `users/${user.uid}/history`);
            const syncConfig = getSyncConfig();
            
            if (!syncConfig.enabled) {
                debugLog.sync('⏸️ Sync disabled in settings');
                return;
            }
            
            debugLog.sync('🔄 Starting background sync for all apps');
            
            onValue(historyRef, async (snapshot) => {
                const history = snapshot.val();
                if (!history) return;

                const apps = Object.keys(history);
                debugLog.sync(`📦 Syncing ${apps.length} apps`);

                for (const key of apps) {
                    const item = history[key];
                    
                    if (item.status === 'Uninstalled') continue;
                    
                    const appName = item.appName || item.filename;
                    if (!appName) continue;
                    
                    try {
                        const detectedPath = await smartFindAppPath(appName, syncConfig.aggression);
                        
                        if (detectedPath && item.status !== 'Installed') {
                            debugLog.sync('✅ Found installed:', appName);
                            await update(ref(mainDb, `users/${user.uid}/history/${key}`), {
                                status: 'Installed',
                                installLocation: detectedPath,
                                lastChecked: Date.now()
                            });
                            
                        } else if (!detectedPath && item.status === 'Installed') {
                            debugLog.sync('❌ No longer installed:', appName);
                            await update(ref(mainDb, `users/${user.uid}/history/${key}`), {
                                status: 'Uninstalled',
                                installLocation: null,
                                lastChecked: Date.now()
                            });
                        }
                    } catch (error) {
                        console.error(`Error checking ${appName}:`, error);
                    }
                }
                
                debugLog.sync('✅ Background sync complete');
            }, (error) => {
                console.error('Profile sync error:', error);
            });
        } else {
            debugLog.guest('Profile sync disabled - guest mode');
        }
    });
}

// =========================================================
// AUTO-INITIALIZE
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname;
    
    if (path.includes('view.html')) {
        debugLog.tracking('📄 Detected view.html - initializing app tracking');
        initAppTracking();
    } else if (path.includes('profile.html')) {
        debugLog.sync('📄 Detected profile.html - initializing profile sync');
        initProfileSync();
    } else {
        debugLog.tracking('📄 Unknown page, skipping initialization');
    }
});