/**
 * ============================================================================
 * APP TRACKING SYSTEM - ENTERPRISE CORE (MODULAR EDITION)
 * ============================================================================
 * File: app_tracking.js
 * Version: 3.0.0 (Modular SDK Upgrade)
 * Architecture: Modular Monolith (Vanilla JS + Firebase v9+)
 * Dependencies: firebase-config.js, window.appAPI (Electron)
 * ============================================================================
 */

import { mainAuth, mainDb } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { ref, get, set, update, remove, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// ============================================================================
// 1. GLOBAL CONSTANTS & CONFIGURATION
// ============================================================================

const CONFIG = {
    DEBUG: true,
    VERSION: '3.0.0',
    SYNC: {
        INTERVAL_MS: 3000,
        DEBOUNCE_MS: 500,
        OFFLINE_QUEUE_KEY: 'naro_offline_queue_v1',
        AGGRESSION_KEY: 'syncAggression'
    },
    STATUS: {
        INSTALLED: 'installed',
        UNINSTALLED: 'uninstalled',
        DOWNLOADING: 'downloading',
        INSTALLING: 'installing',
        PENDING: 'pending',
        UNKNOWN: 'unknown'
    },
    SELECTORS: {
        APP_CARD_ROOT: '#app-card-root',
        APP_TITLE: '#d-app-title',
        APP_IMG: '#d-app-image',
        BTN_DOWNLOAD: '#d-btn-download',
        BTN_OPEN: '#d-btn-open',
        BTN_UNINSTALL: '#d-btn-uninstall',
        BTN_FAV: '#d-btn-fav',
        STATUS_TEXT: '#install-status-dynamic',
        PATH_TEXT: '#loc-path-dynamic'
    },
    COLORS: {
        SUCCESS: '#00e676',
        ERROR: '#d32f2f',
        WARNING: '#ffc107',
        PRIMARY: '#2962ff'
    }
};

// ============================================================================
// 2. UTILITY MODULE
// ============================================================================

const Utils = {
    uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    }),

    debounce: (func, wait) => {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    throttle: (func, limit) => {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    getCleanName: (name) => {
        if (!name || typeof name !== 'string') return "unknown_app";
        if (name === "Loading..." || name === "loading") return ""; 
        return name.toLowerCase()
            .replace(/ pc$/i, '')
            .replace(/ edition$/i, '')
            .replace(/ app$/i, '')
            .replace(/ software$/i, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
    },

    safeParse: (str, fallback = null) => {
        try { return JSON.parse(str); } catch (e) { return fallback; }
    }
};

// ============================================================================
// 3. LOGGER
// ============================================================================

const logger = {
    info: (msg, data) => CONFIG.DEBUG && console.log(`%cℹ️ ${msg}`, 'color:#00e676', data || ''),
    warn: (msg, data) => CONFIG.DEBUG && console.warn(`⚠️ ${msg}`, data || ''),
    error: (msg, err) => CONFIG.DEBUG && console.error(`❌ ${msg}`, err || '')
};

// ============================================================================
// 4. OFFLINE QUEUE MANAGER (MODULAR)
// ============================================================================

class OfflineQueue {
    constructor() {
        this.queue = Utils.safeParse(localStorage.getItem(CONFIG.SYNC.OFFLINE_QUEUE_KEY), []);
        this.isProcessing = false;
        window.addEventListener('online', () => this.process());
    }

    add(action, path, data) {
        this.queue.push({ id: Utils.uuid(), timestamp: Date.now(), action, path, data });
        this.save();
        this.process();
    }

    save() { localStorage.setItem(CONFIG.SYNC.OFFLINE_QUEUE_KEY, JSON.stringify(this.queue)); }

    async process() {
        if (this.isProcessing || !navigator.onLine || this.queue.length === 0) return;

        this.isProcessing = true;
        const failedItems = [];

        for (const item of this.queue) {
            try {
                const dbRef = ref(mainDb, item.path);
                if (item.action === 'set') await set(dbRef, item.data);
                else if (item.action === 'update') await update(dbRef, item.data);
                else if (item.action === 'remove') await remove(dbRef);
            } catch (e) {
                if (e.code !== 'PERMISSION_DENIED') failedItems.push(item);
            }
        }
        this.queue = failedItems;
        this.save();
        this.isProcessing = false;
    }
}

const offlineManager = new OfflineQueue();

// ============================================================================
// 5. ELECTRON BRIDGE
// ============================================================================

class Bridge {
    constructor() {
        this.api = window.appAPI;
        this.isElectron = !!(this.api && this.api.findAppPath);
    }

    async getAppSettings() {
        if (!this.isElectron) return {};
        try { return await this.api.getAppSettings(); } catch (e) { return {}; }
    }

    async findPath(appName, aggression = 5) {
        if (!this.isElectron) return null;
        if (!appName || appName === "Loading..." || appName === "loading") return null;

        try {
            let path = await this.api.findAppPath(appName);
            if (!path) {
                const cleanName = Utils.getCleanName(appName);
                if (!cleanName) return null;
                
                if (this.api.findPath) path = await this.api.findPath(cleanName, aggression);
                else path = await this.api.findAppPath(cleanName);
            }
            return path;
        } catch (e) {
            return null;
        }
    }

    async installApp(path) {
        if (!this.isElectron) return false;
        try { await this.api.installApp(path); return true; } catch (e) { return false; }
    }

    async uninstallApp(appName) {
        if (!this.isElectron) return false;
        try { await this.api.uninstallApp(appName); return true; } catch (e) { return false; }
    }

    async openApp(appName) {
        if (!this.isElectron) return false;
        try { await this.api.openApp(appName); return true; } catch (e) { return false; }
    }

    async openFileLocation(path) {
        if (!this.isElectron) return;
        try { await this.api.openFileLocation(path); } catch (e) { console.error(e); }
    }

    showToast(message) {
        if (window.showToast) window.showToast(message);
        else console.log(`Toast: ${message}`);
    }
}

const bridge = new Bridge();

// ============================================================================
// 6. FIREBASE MANAGER (MODULAR - SHARED AUTH)
// ============================================================================

class FirebaseManager {
    constructor() {
        this.auth = mainAuth;
        this.db = mainDb;
        this.currentUser = null;
        this.unsubscribes = []; // Store cleanup functions
        this.init();
    }

    init() {
        onAuthStateChanged(this.auth, (user) => {
            this.currentUser = user;
            if (user) {
                logger.info("Auth Synced:", user.uid);
                offlineManager.process();
            } else {
                this.cleanupListeners();
            }
            document.dispatchEvent(new CustomEvent('naro:auth-changed', { detail: { user } }));
        });
    }

    cleanupListeners() {
        this.unsubscribes.forEach(unsub => unsub());
        this.unsubscribes = [];
    }

    // Use onValue for real-time listeners
    addListener(path, callback) {
        if (!this.currentUser) return;
        const dbRef = ref(this.db, path);
        const unsub = onValue(dbRef, callback);
        this.unsubscribes.push(unsub);
    }

    async updateHistory(appId, data) {
        if (!this.currentUser) return;
        const path = `users/${this.currentUser.uid}/history/${appId}`;
        
        if (navigator.onLine) {
            try { await update(ref(this.db, path), data); } 
            catch (e) { offlineManager.add('update', path, data); }
        } else {
            offlineManager.add('update', path, data);
        }
    }

    async toggleFavorite(appId, appData) {
        // ALWAYS check the live auth object, not just local state
        const user = this.auth.currentUser; 
        
        if (!user) { 
            bridge.showToast("Please login."); 
            return null; 
        }

        const path = `users/${user.uid}/favorites/${appId}`;
        try {
            const snap = await get(ref(this.db, path));
            if (snap.exists()) {
                await remove(ref(this.db, path));
                bridge.showToast("Removed from favorites");
                return false;
            } else {
                await set(ref(this.db, path), { 
                    ...appData, 
                    timestamp: serverTimestamp() 
                });
                bridge.showToast("Added to favorites");
                return true;
            }
        } catch (e) { 
            logger.error("Fav Error", e);
            return null; 
        }
    }
}

const fbManager = new FirebaseManager();

// ============================================================================
// 7. UI STATE MANAGER
// ============================================================================

class UIState {
    constructor() {
        this.elements = {};
        this.currentStatus = CONFIG.STATUS.UNKNOWN;
        this.bindElements();
    }

    bindElements() {
        for (const [key, selector] of Object.entries(CONFIG.SELECTORS)) {
            this.elements[key] = document.querySelector(selector);
        }
    }

    updateStatus(status, path = null) {
        if (this.currentStatus === status && this.currentPath === path) return;
        this.currentStatus = status;
        this.currentPath = path;

        const { BTN_DOWNLOAD, BTN_OPEN, BTN_UNINSTALL, STATUS_TEXT, PATH_TEXT } = this.elements;
        if (!STATUS_TEXT) this.bindElements();

        if (BTN_DOWNLOAD) BTN_DOWNLOAD.style.display = 'none';
        if (BTN_OPEN) BTN_OPEN.style.display = 'none';
        if (BTN_UNINSTALL) BTN_UNINSTALL.style.display = 'none';

        if (status === CONFIG.STATUS.INSTALLED) {
            if (BTN_OPEN) BTN_OPEN.style.display = 'inline-flex';
            if (BTN_UNINSTALL) BTN_UNINSTALL.style.display = 'inline-flex';
            if (STATUS_TEXT) STATUS_TEXT.innerHTML = `<span style="color:${CONFIG.COLORS.SUCCESS}; font-weight:bold;"><i class="fa-solid fa-check"></i> Installed</span>`;
            if (PATH_TEXT) {
                PATH_TEXT.innerText = path || "Detected locally";
                PATH_TEXT.onclick = () => bridge.openFileLocation(path);
                PATH_TEXT.style.cursor = "pointer";
            }
        } else if (status === CONFIG.STATUS.DOWNLOADING) {
            if (STATUS_TEXT) STATUS_TEXT.innerHTML = `<span style="color:${CONFIG.COLORS.PRIMARY};"><i class="fa-solid fa-spinner fa-spin"></i> Downloading...</span>`;
        } else {
            if (BTN_DOWNLOAD) BTN_DOWNLOAD.style.display = 'inline-flex';
            if (STATUS_TEXT) STATUS_TEXT.innerText = "Not Installed";
            if (PATH_TEXT) {
                PATH_TEXT.innerText = "—";
                PATH_TEXT.onclick = null;
                PATH_TEXT.style.cursor = "default";
            }
        }
    }

    setFavoriteState(isFav) {
        if (!this.elements.BTN_FAV) this.bindElements();
        const btn = this.elements.BTN_FAV;
        if (!btn) return;
        
        const icon = btn.querySelector('i');
        if (isFav) {
            btn.classList.add('active');
            if (icon) icon.className = "fa-solid fa-heart";
            btn.style.color = "#f44336";
        } else {
            btn.classList.remove('active');
            if (icon) icon.className = "fa-regular fa-heart";
            btn.style.color = "";
        }
    }
}

const uiState = new UIState();

// ============================================================================
// 8. VIEW PAGE CONTROLLER
// ============================================================================

class ViewPageController {
    constructor() {
        this.appId = null;
        this.appName = null;
        this.appIcon = null;
        this.syncTimer = null;
        this.aggressionLevel = 5;
    }

    async init() {
        const appCard = document.querySelector(CONFIG.SELECTORS.APP_CARD_ROOT);
        if (!appCard) return;

        await this.waitForMetadata();

        this.appId = appCard.dataset.app;
        this.appName = document.querySelector(CONFIG.SELECTORS.APP_TITLE)?.innerText;
        this.appIcon = document.querySelector(CONFIG.SELECTORS.APP_IMG)?.src;

        if (!this.appName || this.appName === "Loading...") return;

        const settings = await bridge.getAppSettings();
        if (settings[CONFIG.SYNC.AGGRESSION_KEY]) {
            this.aggressionLevel = parseInt(settings[CONFIG.SYNC.AGGRESSION_KEY]);
        }

        this.attachHandlers();
        this.startSync();

        // Immediate check if user is already loaded
        if (fbManager.currentUser) {
            this.checkRemoteStatus(fbManager.currentUser.uid);
            this.checkFavoriteStatus(fbManager.currentUser.uid);
        }

        document.addEventListener('naro:auth-changed', (e) => {
            if (e.detail.user) {
                this.checkRemoteStatus(e.detail.user.uid);
                this.checkFavoriteStatus(e.detail.user.uid);
            }
        });
    }

    async waitForMetadata() {
        return new Promise((resolve) => {
            const titleEl = document.querySelector(CONFIG.SELECTORS.APP_TITLE);
            if (titleEl && titleEl.innerText !== "Loading...") return resolve();

            const observer = new MutationObserver(() => {
                const text = titleEl.innerText;
                if (text && text !== "Loading...") {
                    observer.disconnect();
                    resolve();
                }
            });
            if (titleEl) observer.observe(titleEl, { childList: true, characterData: true, subtree: true });

            // Fallback
            setTimeout(() => { observer.disconnect(); resolve(); }, 3000);
        });
    }

    attachHandlers() {
        const els = uiState.elements;

        if (els.BTN_DOWNLOAD) {
            els.BTN_DOWNLOAD.onclick = Utils.debounce(() => {
                if (!fbManager.auth.currentUser) { bridge.showToast("Please login."); return; }
                
                bridge.showToast("Download started...");
                uiState.updateStatus(CONFIG.STATUS.DOWNLOADING);
                fbManager.updateHistory(this.appId, {
                    appName: this.appName,
                    appId: this.appId,
                    icon: this.appIcon,
                    timestamp: serverTimestamp(),
                    status: 'Downloading',
                    filename: this.appName + ".exe"
                });
            }, 300);
        }

        if (els.BTN_OPEN) {
            els.BTN_OPEN.onclick = Utils.throttle(async () => {
                bridge.showToast(`Launching ${this.appName}...`);
                await bridge.openApp(this.appName);
            }, 2000);
        }

        if (els.BTN_UNINSTALL) {
            els.BTN_UNINSTALL.onclick = async (e) => {
                e.preventDefault();
                if (confirm(`Uninstall ${this.appName}?`)) {
                    bridge.showToast("Uninstalling...");
                    const success = await bridge.uninstallApp(Utils.getCleanName(this.appName));
                    if (success) {
                        uiState.updateStatus(CONFIG.STATUS.UNINSTALLED);
                        fbManager.updateHistory(this.appId, { status: 'Uninstalled', installLocation: null });
                    }
                }
            };
        }

        if (els.BTN_FAV) {
            els.BTN_FAV.onclick = Utils.debounce(async () => {
                const isNowFav = await fbManager.toggleFavorite(this.appId, {
                    appName: this.appName,
                    icon: this.appIcon,
                    appId: this.appId
                });
                if (isNowFav !== null) uiState.setFavoriteState(isNowFav);
            }, 300);
        }
    }

    startSync() {
        this.runSyncCycle();
        this.syncTimer = setInterval(() => this.runSyncCycle(), CONFIG.SYNC.INTERVAL_MS);
    }

    async runSyncCycle() {
        if (document.hidden) return;
        // GUARD: Stop Electron IPC if not logged in
        if (!fbManager.auth.currentUser) return;

        if (!this.appName || this.appName === "Loading...") return;

        try {
            const localPath = await bridge.findPath(this.appName, this.aggressionLevel);
            
            if (localPath) {
                uiState.updateStatus(CONFIG.STATUS.INSTALLED, localPath);
            } else {
                if (uiState.currentStatus !== CONFIG.STATUS.DOWNLOADING) {
                    uiState.updateStatus(CONFIG.STATUS.UNINSTALLED);
                }
            }

            if (fbManager.currentUser && localPath) {
                fbManager.updateHistory(this.appId, {
                    appName: this.appName,
                    icon: this.appIcon,
                    status: 'Installed',
                    installLocation: localPath,
                    lastChecked: Date.now()
                });
            }
        } catch (e) {}
    }

    checkRemoteStatus(uid) {
        fbManager.addListener(`users/${uid}/history/${this.appId}`, (snapshot) => {
            const data = snapshot.val();
            if (data && data.status === 'Downloading') {
                uiState.updateStatus(CONFIG.STATUS.DOWNLOADING);
            }
        });
    }

    checkFavoriteStatus(uid) {
        fbManager.addListener(`users/${uid}/favorites/${this.appId}`, (snapshot) => {
            uiState.setFavoriteState(snapshot.exists());
        });
    }
}

// ============================================================================
// 9. PROFILE PAGE LOGIC (MODULAR)
// ============================================================================

class ProfilePageController {
    init() {
        document.addEventListener('naro:auth-changed', (e) => {
            if (e.detail.user) this.startBatchSync(e.detail.user);
        });
        if (fbManager.currentUser) this.startBatchSync(fbManager.currentUser);
    }

    async startBatchSync(user) {
        const historyRef = ref(mainDb, `users/${user.uid}/history`);
        try {
            const snapshot = await get(historyRef);
            const historyData = snapshot.val();
            if (!historyData) return;

            const keys = Object.keys(historyData);
            const updates = {};
            let hasUpdates = false;

            for (const key of keys) {
                const item = historyData[key];
                const name = item.appName || item.filename;
                if (!name) continue;

                const path = await bridge.findPath(name, 3);
                const dbStatus = item.status;
                
                if (dbStatus === 'Downloading') continue;

                if (path && dbStatus !== 'Installed') {
                    updates[`${key}/status`] = 'Installed';
                    updates[`${key}/installLocation`] = path;
                    hasUpdates = true;
                } else if (!path && dbStatus === 'Installed') {
                    updates[`${key}/status`] = 'Uninstalled';
                    updates[`${key}/installLocation`] = null;
                    hasUpdates = true;
                }
            }

            if (hasUpdates) await update(historyRef, updates);
        } catch (e) {
            logger.error("Batch sync failed", e);
        }
    }
}

// ============================================================================
// 10. BOOTSTRAPPER
// ============================================================================

if (window.location.pathname.includes('view.html') || document.querySelector(CONFIG.SELECTORS.APP_CARD_ROOT)) {
    new ViewPageController().init();
} else if (window.location.pathname.includes('profile.html')) {
    new ProfilePageController().init();
}