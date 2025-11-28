/**
 * ============================================================================
 * APP TRACKING SYSTEM - ENTERPRISE CORE
 * ============================================================================
 * File: app_tracking.js
 * Version: 2.5.1 (Race Condition Fix)
 * Architecture: Modular Monolith (Vanilla JS)
 * Dependencies: window.firebase, window.appAPI (Electron Context Bridge)
 * Description: 
 * Handles app state tracking, installation monitoring, synchronization
 * between local filesystem and Firebase Realtime Database.
 * Includes "Wait-For-Data" logic to prevent tracking "Loading..." placeholder.
 * ============================================================================
 */

(function() {
    'use strict';

    // ============================================================================
    // 1. GLOBAL CONSTANTS & CONFIGURATION
    // ============================================================================

    const CONFIG = {
        DEBUG: true,
        VERSION: '2.5.1',
        SYNC: {
            INTERVAL_MS: 3000,
            DEBOUNCE_MS: 500,
            MAX_RETRIES: 3,
            OFFLINE_QUEUE_KEY: 'naro_offline_queue_v1',
            AGGRESSION_KEY: 'syncAggression'
        },
        STATUS: {
            INSTALLED: 'installed',
            UNINSTALLED: 'uninstalled',
            DOWNLOADING: 'downloading',
            INSTALLING: 'installing',
            PENDING: 'pending',
            UPDATE_AVAILABLE: 'update_available',
            CORRUPTED: 'corrupted',
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
            PATH_TEXT: '#loc-path-dynamic',
            LOADER: '.loading-overlay'
        },
        COLORS: {
            SUCCESS: '#00e676',
            ERROR: '#d32f2f',
            WARNING: '#ffc107',
            NEUTRAL: '#aaaaaa',
            PRIMARY: '#2962ff'
        }
    };

    // ============================================================================
    // 2. UTILITY MODULE (PERFORMANCE & HELPERS)
    // ============================================================================

    const Utils = {
        uuid: () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        debounce: (func, wait) => {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        },

        throttle: (func, limit) => {
            let inThrottle;
            return function(...args) {
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        getCleanName: (name) => {
            if (!name || typeof name !== 'string') return "unknown_app";
            // Prevent cleaning placeholder text to avoid weird IPC calls
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
    // 3. LOGGING & TELEMETRY SYSTEM
    // ============================================================================

    class Logger {
        constructor() { this.logs = []; this.maxLogs = 1000; }

        _push(level, message, data = null) {
            this.logs.unshift({ timestamp: new Date().toISOString(), level, message, data });
            if (this.logs.length > this.maxLogs) this.logs.pop();

            if (CONFIG.DEBUG) {
                const icon = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : 'ℹ️';
                const style = level === 'ERROR' ? 'color: red;' : level === 'WARN' ? 'color: orange;' : 'color: #00e676;';
                if (data) {
                    console.groupCollapsed(`${icon} [Tracking] ${message}`);
                    console.log(data);
                    console.groupEnd();
                } else {
                    console.log(`%c${icon} [Tracking] ${message}`, style);
                }
            }
        }
        info(msg, data) { this._push('INFO', msg, data); }
        success(msg, data) { this._push('SUCCESS', msg, data); }
        warn(msg, data) { this._push('WARN', msg, data); }
        error(msg, err) { this._push('ERROR', msg, err); }
        exportLogs() { return JSON.stringify(this.logs, null, 2); }
    }

    const logger = new Logger();

    // ============================================================================
    // 4. OFFLINE QUEUE MANAGER
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
            if (!window.firebase || !window.firebase.database) return;

            this.isProcessing = true;
            const db = window.firebase.database();
            const failedItems = [];

            for (const item of this.queue) {
                try {
                    const ref = db.ref(item.path);
                    if (item.action === 'set') await ref.set(item.data);
                    else if (item.action === 'update') await ref.update(item.data);
                    else if (item.action === 'remove') await ref.remove();
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
    // 5. ELECTRON IPC BRIDGE
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
            // Guard clause for invalid app names
            if (!appName || appName === "Loading..." || appName === "loading") {
                return null;
            }

            try {
                // 1. Exact Match
                let path = await this.api.findAppPath(appName);
                
                // 2. Clean Match
                if (!path) {
                    const cleanName = Utils.getCleanName(appName);
                    if (!cleanName) return null; // Abort if clean name is empty
                    
                    if (this.api.findPath) {
                        path = await this.api.findPath(cleanName, aggression);
                    } else {
                        path = await this.api.findAppPath(cleanName);
                    }
                }
                return path;
            } catch (e) {
                logger.error(`IPC: findPath failed for ${appName}`, e);
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
            try { await this.api.openFileLocation(path); } catch (e) { logger.error("OpenLoc fail", e); }
        }

        showToast(message) {
            if (window.showToast) window.showToast(message);
            else console.log(`Toast: ${message}`);
        }
    }

    const bridge = new Bridge();

    // ============================================================================
    // 6. FIREBASE MANAGER
    // ============================================================================

    class FirebaseManager {
        constructor() {
            this.auth = null;
            this.db = null;
            this.isInitialized = false;
            this.currentUser = null;
            this.listeners = new Map();
        }

        async init() {
            if (this.isInitialized) return true;
            try {
                if (typeof firebase === 'undefined') return false;
                if (!firebase.apps.length) {
                    if (window.appAPI && window.appAPI.getFirebaseConfig) {
                        const config = await window.appAPI.getFirebaseConfig();
                        firebase.initializeApp(config);
                    } else {
                        return false;
                    }
                }
                this.auth = firebase.auth();
                this.db = firebase.database();
                this.isInitialized = true;

                this.auth.onAuthStateChanged((user) => {
                    this.currentUser = user;
                    if (user) offlineManager.process();
                    else this.cleanupListeners();
                    document.dispatchEvent(new CustomEvent('naro:auth-changed', { detail: { user } }));
                });
                return true;
            } catch (e) {
                logger.error("Firebase Init Failed", e);
                return false;
            }
        }

        cleanupListeners() {
            this.listeners.forEach((ref) => ref.off());
            this.listeners.clear();
        }

        addListener(path, eventType, callback) {
            if (!this.db || !this.currentUser) return;
            const key = `${path}:${eventType}`;
            if (this.listeners.has(key)) return;
            const ref = this.db.ref(path);
            ref.on(eventType, callback);
            this.listeners.set(key, ref);
        }

        async updateHistory(appId, data) {
            if (!this.currentUser) return;
            const path = `users/${this.currentUser.uid}/history/${appId}`;
            if (navigator.onLine) {
                try { await this.db.ref(path).update(data); } 
                catch (e) { offlineManager.add('update', path, data); }
            } else {
                offlineManager.add('update', path, data);
            }
        }

        async toggleFavorite(appId, appData) {
            if (!this.currentUser) { bridge.showToast("Please login."); return null; }
            const path = `users/${this.currentUser.uid}/favorites/${appId}`;
            try {
                const snap = await this.db.ref(path).once('value');
                if (snap.exists()) {
                    await this.db.ref(path).remove();
                    bridge.showToast("Removed from favorites");
                    return false;
                } else {
                    await this.db.ref(path).set({ ...appData, timestamp: firebase.database.ServerValue.TIMESTAMP });
                    bridge.showToast("Added to favorites");
                    return true;
                }
            } catch (e) { return null; }
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
            
            // Re-query if elements were missing during bind (async dom load)
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
            if (!this.elements.BTN_FAV) return;
            
            const icon = this.elements.BTN_FAV.querySelector('i');
            if (isFav) {
                this.elements.BTN_FAV.classList.add('active');
                if (icon) icon.className = "fa-solid fa-heart";
                this.elements.BTN_FAV.style.color = "#f44336";
            } else {
                this.elements.BTN_FAV.classList.remove('active');
                if (icon) icon.className = "fa-regular fa-heart";
                this.elements.BTN_FAV.style.color = "";
            }
        }
    }

    const uiState = new UIState();

    // ============================================================================
    // 8. VIEW PAGE LOGIC CONTROLLER (WITH WAIT-FOR-DATA)
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

            // --- CRITICAL FIX: WAIT FOR APP NAME TO LOAD ---
            // The view.html loads async. We must wait for the title to change 
            // from "Loading..." to the actual name before we ask Electron to search.
            await this.waitForMetadata();

            // Refresh DOM references after wait
            this.appId = appCard.dataset.app;
            this.appName = document.querySelector(CONFIG.SELECTORS.APP_TITLE)?.innerText;
            this.appIcon = document.querySelector(CONFIG.SELECTORS.APP_IMG)?.src;

            // Double check safety
            if (!this.appName || this.appName === "Loading..." || this.appName === "loading") {
                logger.warn("Tracking aborted: Metadata invalid or timed out.");
                return;
            }

            logger.info(`Tracking Started for: "${this.appName}"`);

            // Load Settings
            const settings = await bridge.getAppSettings();
            if (settings[CONFIG.SYNC.AGGRESSION_KEY]) {
                this.aggressionLevel = parseInt(settings[CONFIG.SYNC.AGGRESSION_KEY]);
            }

            this.attachHandlers();
            this.startSync();

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
                
                // 1. Check if already ready
                if (titleEl && titleEl.innerText && titleEl.innerText !== "Loading..." && titleEl.innerText !== "loading") {
                    return resolve();
                }

                logger.info("Waiting for app metadata population...");

                // 2. Observer Strategy
                const observer = new MutationObserver(() => {
                    const text = titleEl.innerText;
                    if (text && text !== "Loading..." && text !== "loading") {
                        observer.disconnect();
                        resolve();
                    }
                });
                
                if (titleEl) {
                    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
                }

                // 3. Fallback Polling (Max 10 seconds)
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    const text = document.querySelector(CONFIG.SELECTORS.APP_TITLE)?.innerText;
                    
                    if (text && text !== "Loading..." && text !== "loading") {
                        clearInterval(interval);
                        observer.disconnect();
                        resolve();
                    }
                    
                    if (attempts > 20) { // 10 seconds (20 * 500ms)
                        clearInterval(interval);
                        observer.disconnect();
                        logger.warn("Metadata wait timed out. proceeding with caution.");
                        resolve();
                    }
                }, 500);
            });
        }

        attachHandlers() {
            const els = uiState.elements;

            if (els.BTN_DOWNLOAD) {
                els.BTN_DOWNLOAD.onclick = Utils.debounce(() => {
                    if (!fbManager.currentUser) { bridge.showToast("Please login."); return; }
                    bridge.showToast("Download started...");
                    uiState.updateStatus(CONFIG.STATUS.DOWNLOADING);
                    fbManager.updateHistory(this.appId, {
                        appName: this.appName,
                        appId: this.appId,
                        icon: this.appIcon,
                        timestamp: firebase.database.ServerValue.TIMESTAMP,
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
            // Guard: Never search for "Loading..."
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
                        status: 'Installed',
                        installLocation: localPath,
                        lastChecked: Date.now()
                    });
                }
            } catch (e) {
                // Silent catch for loop
            }
        }

        checkRemoteStatus(uid) {
            fbManager.addListener(`users/${uid}/history/${this.appId}`, 'value', (snapshot) => {
                const data = snapshot.val();
                if (data && data.status === 'Downloading') {
                    uiState.updateStatus(CONFIG.STATUS.DOWNLOADING);
                }
            });
        }

        checkFavoriteStatus(uid) {
            fbManager.addListener(`users/${uid}/favorites/${this.appId}`, 'value', (snapshot) => {
                uiState.setFavoriteState(snapshot.exists());
            });
        }
    }

    // ============================================================================
    // 9. PROFILE PAGE LOGIC (BATCH PROCESSING)
    // ============================================================================

    class ProfilePageController {
        init() {
            document.addEventListener('naro:auth-changed', (e) => {
                if (e.detail.user) this.startBatchSync(e.detail.user);
            });
            if (fbManager.currentUser) this.startBatchSync(fbManager.currentUser);
        }

        async startBatchSync(user) {
            const ref = fbManager.db.ref(`users/${user.uid}/history`);
            try {
                const snapshot = await ref.once('value');
                const historyData = snapshot.val();
                if (!historyData) return;

                const keys = Object.keys(historyData);
                const updates = {};
                let hasUpdates = false;

                // Process sequentially to prevent IPC flooding
                for (const key of keys) {
                    const item = historyData[key];
                    const name = item.appName || item.filename;
                    
                    if (!name) continue;

                    const path = await bridge.findPath(name, 3);
                    const dbStatus = item.status;
                    
                    // Don't overwrite downloading status
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

                if (hasUpdates) await ref.update(updates);
            } catch (e) {
                logger.error("Batch sync failed", e);
            }
        }
    }

    // ============================================================================
    // 10. BOOTSTRAPPER
    // ============================================================================

    class AppBootstrapper {
        static async run() {
            // 1. Init Services
            const fbReady = await fbManager.init();
            if (!fbReady) setTimeout(AppBootstrapper.retryFirebase, 2000);

            // 2. Route Logic
            const path = window.location.pathname;
            if (path.includes('view.html') || document.querySelector(CONFIG.SELECTORS.APP_CARD_ROOT)) {
                new ViewPageController().init();
            } else if (path.includes('profile.html')) {
                new ProfilePageController().init();
            }

            // 3. Expose Debug
            window.NaroTracker = {
                logs: () => logger.exportLogs()
            };
        }

        static async retryFirebase() {
            await fbManager.init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', AppBootstrapper.run);
    } else {
        AppBootstrapper.run();
    }

})();