/**
 * ============================================================================
 * APP TRACKING SYSTEM - ENTERPRISE CORE
 * ============================================================================
 * File: app_tracking.js
 * Version: 2.5.0 (Stable/Optimized)
 * Architecture: Modular Monolith (Vanilla JS)
 * Dependencies: window.firebase, window.appAPI (Electron Context Bridge)
 * Description: 
 * Handles app state tracking, installation monitoring, synchronization
 * between local filesystem and Firebase Realtime Database.
 * Implements advanced caching, request throttling, and offline persistence.
 * ============================================================================
 */

(function() {
    'use strict';

    // ============================================================================
    // 1. GLOBAL CONSTANTS & CONFIGURATION
    // ============================================================================

    const CONFIG = {
        DEBUG: true,
        VERSION: '2.5.0',
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
        /**
         * Generates a unique session ID for telemetry
         */
        uuid: () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        /**
         * Debounce function to limit rapid firing of events
         */
        debounce: (func, wait) => {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        },

        /**
         * Throttle function to ensure execution at set intervals
         */
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

        /**
         * Cleans app names for filesystem matching
         * Matches logic in renderer.js
         */
        getCleanName: (name) => {
            if (!name || typeof name !== 'string') return "unknown_app";
            return name.toLowerCase()
                .replace(/ pc$/i, '')
                .replace(/ edition$/i, '')
                .replace(/ app$/i, '')
                .replace(/ software$/i, '')
                .replace(/[^a-z0-9]/g, '')
                .trim();
        },

        /**
         * Deep object comparison for state changes
         */
        isEqual: (obj1, obj2) => {
            return JSON.stringify(obj1) === JSON.stringify(obj2);
        },

        /**
         * Safe JSON parser
         */
        safeParse: (str, fallback = null) => {
            try {
                return JSON.parse(str);
            } catch (e) {
                return fallback;
            }
        },

        /**
         * Formats bytes to readable string
         */
        formatBytes: (bytes, decimals = 2) => {
            if (!+bytes) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        }
    };

    // ============================================================================
    // 3. LOGGING & TELEMETRY SYSTEM
    // ============================================================================

    class Logger {
        constructor() {
            this.logs = [];
            this.maxLogs = 1000;
        }

        _push(level, message, data = null) {
            const entry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                data
            };
            this.logs.unshift(entry);
            if (this.logs.length > this.maxLogs) this.logs.pop();

            if (CONFIG.DEBUG) {
                const icon = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : 'ℹ️';
                const style = level === 'ERROR' ? 'color: red;' : level === 'WARN' ? 'color: orange;' : 'color: #00e676;';
                
                if (data) {
                    console.groupCollapsed(`${icon} [Tracking] ${message}`);
                    console.log(data);
                    console.trace(); // Helpful for debugging
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
        
        exportLogs() {
            return JSON.stringify(this.logs, null, 2);
        }
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
            this.queue.push({
                id: Utils.uuid(),
                timestamp: Date.now(),
                action, // 'set', 'update', 'remove'
                path,
                data
            });
            this.save();
            this.process();
        }

        save() {
            localStorage.setItem(CONFIG.SYNC.OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
        }

        async process() {
            if (this.isProcessing || !navigator.onLine || this.queue.length === 0) return;
            if (!window.firebase || !window.firebase.database) return;

            this.isProcessing = true;
            logger.info(`Processing ${this.queue.length} offline operations...`);

            const db = window.firebase.database();
            const failedItems = [];

            for (const item of this.queue) {
                try {
                    const ref = db.ref(item.path);
                    if (item.action === 'set') await ref.set(item.data);
                    else if (item.action === 'update') await ref.update(item.data);
                    else if (item.action === 'remove') await ref.remove();
                    
                    logger.success(`Processed offline item: ${item.action} on ${item.path}`);
                } catch (e) {
                    logger.error(`Failed to process offline item`, e);
                    // Keep item if error is likely transient, drop if permanent auth error
                    if (e.code !== 'PERMISSION_DENIED') {
                        failedItems.push(item);
                    }
                }
            }

            this.queue = failedItems;
            this.save();
            this.isProcessing = false;
        }
    }

    const offlineManager = new OfflineQueue();

    // ============================================================================
    // 5. ELECTRON IPC BRIDGE (ROBUST WRAPPER)
    // ============================================================================

    class Bridge {
        constructor() {
            this.api = window.appAPI;
            this.isElectron = !!(this.api && this.api.findAppPath);
            if (!this.isElectron) {
                logger.warn("Running in Browser Mode - IPC features disabled");
            }
        }

        async getAppSettings() {
            if (!this.isElectron) return {};
            try {
                return await this.api.getAppSettings();
            } catch (e) {
                logger.error("IPC: getAppSettings failed", e);
                return {};
            }
        }

        async findPath(appName, aggression = 5) {
            if (!this.isElectron) return null;
            try {
                const startTime = performance.now();
                
                // 1. Exact Match
                let path = await this.api.findAppPath(appName);
                
                // 2. Clean Match if exact fails
                if (!path) {
                    const cleanName = Utils.getCleanName(appName);
                    // Leverage the 'findPath' with aggression from renderer if available
                    // or simulate heuristics
                    if (this.api.findPath) {
                        path = await this.api.findPath(cleanName, aggression);
                    } else {
                        path = await this.api.findAppPath(cleanName);
                    }
                }

                const duration = (performance.now() - startTime).toFixed(2);
                if (path) logger.info(`Found path for ${appName} in ${duration}ms`, path);
                
                return path;
            } catch (e) {
                logger.error(`IPC: findPath failed for ${appName}`, e);
                return null;
            }
        }

        async installApp(path) {
            if (!this.isElectron) return logger.warn("Install not supported in browser");
            try {
                await this.api.installApp(path);
                return true;
            } catch (e) {
                logger.error("IPC: installApp failed", e);
                return false;
            }
        }

        async uninstallApp(appName) {
            if (!this.isElectron) return logger.warn("Uninstall not supported in browser");
            try {
                await this.api.uninstallApp(appName);
                return true;
            } catch (e) {
                logger.error("IPC: uninstallApp failed", e);
                return false;
            }
        }

        async openApp(appName) {
            if (!this.isElectron) return logger.warn("Open not supported in browser");
            try {
                await this.api.openApp(appName);
                return true;
            } catch (e) {
                logger.error("IPC: openApp failed", e);
                return false;
            }
        }

        async openFileLocation(path) {
            if (!this.isElectron) return;
            try {
                await this.api.openFileLocation(path);
            } catch (e) {
                logger.error("IPC: openFileLocation failed", e);
            }
        }

        showToast(message) {
            if (window.showToast) {
                window.showToast(message);
            } else {
                console.log(`Toast: ${message}`);
            }
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
                // 1. Wait for global object if necessary
                if (typeof firebase === 'undefined') {
                    logger.error("Firebase SDK missing from window scope.");
                    return false;
                }

                // 2. Initialize App
                if (!firebase.apps.length) {
                    if (window.appAPI && window.appAPI.getFirebaseConfig) {
                        const config = await window.appAPI.getFirebaseConfig();
                        firebase.initializeApp(config);
                        logger.success("Firebase initialized via IPC config");
                    } else {
                        logger.warn("No appAPI found for Firebase config");
                        return false;
                    }
                }

                // 3. Bind Services
                this.auth = firebase.auth();
                this.db = firebase.database();
                this.isInitialized = true;

                // 4. Setup Auth Listener
                this.auth.onAuthStateChanged((user) => {
                    this.currentUser = user;
                    if (user) {
                        logger.info(`Auth State: Logged in as ${user.email}`);
                        offlineManager.process(); // Try to flush queue on login
                    } else {
                        logger.info("Auth State: Logged out");
                        this.cleanupListeners();
                    }
                    // Trigger global event for other components
                    document.dispatchEvent(new CustomEvent('naro:auth-changed', { detail: { user } }));
                });

                return true;
            } catch (e) {
                logger.error("Firebase Init Failed", e);
                return false;
            }
        }

        cleanupListeners() {
            this.listeners.forEach((ref, key) => {
                ref.off();
                logger.info(`Removed DB listener: ${key}`);
            });
            this.listeners.clear();
        }

        addListener(path, eventType, callback) {
            if (!this.db || !this.currentUser) return;
            
            // Deduplicate listeners
            const key = `${path}:${eventType}`;
            if (this.listeners.has(key)) return;

            const ref = this.db.ref(path);
            ref.on(eventType, callback);
            this.listeners.set(key, ref);
            logger.info(`Added DB listener: ${key}`);
        }

        async updateHistory(appId, data) {
            if (!this.currentUser) return;
            const path = `users/${this.currentUser.uid}/history/${appId}`;
            
            if (navigator.onLine) {
                try {
                    await this.db.ref(path).update(data);
                } catch (e) {
                    logger.error("DB Update Failed, queuing", e);
                    offlineManager.add('update', path, data);
                }
            } else {
                offlineManager.add('update', path, data);
            }
        }

        async toggleFavorite(appId, appData) {
            if (!this.currentUser) {
                bridge.showToast("Please login to manage favorites");
                return false;
            }

            const path = `users/${this.currentUser.uid}/favorites/${appId}`;
            const ref = this.db.ref(path);

            try {
                const snapshot = await ref.once('value');
                if (snapshot.exists()) {
                    await ref.remove();
                    bridge.showToast("Removed from favorites");
                    return false; // Removed
                } else {
                    await ref.set({
                        ...appData,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                    bridge.showToast("Added to favorites");
                    return true; // Added
                }
            } catch (e) {
                logger.error("Favorite toggle failed", e);
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
            this.currentAppId = null;
            this.currentStatus = CONFIG.STATUS.UNKNOWN;
            
            // Bind cache on load
            this.bindElements();
        }

        bindElements() {
            for (const [key, selector] of Object.entries(CONFIG.SELECTORS)) {
                const el = document.querySelector(selector);
                if (el) this.elements[key] = el;
            }
        }

        setLoading(isLoading) {
            // Optional: Implementation for a global loading spinner if HTML exists
            if (this.elements.LOADER) {
                this.elements.LOADER.style.display = isLoading ? 'flex' : 'none';
            }
        }

        updateStatus(status, path = null) {
            // Guard against UI churn
            if (this.currentStatus === status && this.currentPath === path) return;
            
            this.currentStatus = status;
            this.currentPath = path;

            const { BTN_DOWNLOAD, BTN_OPEN, BTN_UNINSTALL, STATUS_TEXT, PATH_TEXT } = this.elements;

            // 1. Reset Buttons
            if (BTN_DOWNLOAD) BTN_DOWNLOAD.style.display = 'none';
            if (BTN_OPEN) BTN_OPEN.style.display = 'none';
            if (BTN_UNINSTALL) BTN_UNINSTALL.style.display = 'none';

            // 2. Logic
            switch (status) {
                case CONFIG.STATUS.INSTALLED:
                    if (BTN_OPEN) BTN_OPEN.style.display = 'inline-flex';
                    if (BTN_UNINSTALL) BTN_UNINSTALL.style.display = 'inline-flex';
                    
                    if (STATUS_TEXT) {
                        STATUS_TEXT.innerHTML = `<span style="color:${CONFIG.COLORS.SUCCESS}; font-weight:bold;"><i class="fa-solid fa-check"></i> Installed</span>`;
                    }
                    
                    if (PATH_TEXT) {
                        PATH_TEXT.innerText = path || "Detected locally";
                        PATH_TEXT.style.cursor = "pointer";
                        PATH_TEXT.style.textDecoration = "underline";
                        PATH_TEXT.onclick = () => bridge.openFileLocation(path);
                        PATH_TEXT.title = "Click to open folder";
                    }
                    break;

                case CONFIG.STATUS.DOWNLOADING:
                    if (STATUS_TEXT) {
                        STATUS_TEXT.innerHTML = `<span style="color:${CONFIG.COLORS.PRIMARY};"><i class="fa-solid fa-spinner fa-spin"></i> Downloading...</span>`;
                    }
                    break;

                default: // Uninstalled / Unknown
                    if (BTN_DOWNLOAD) BTN_DOWNLOAD.style.display = 'inline-flex';
                    
                    if (STATUS_TEXT) {
                        STATUS_TEXT.innerText = "Not Installed";
                        STATUS_TEXT.style.color = CONFIG.COLORS.NEUTRAL;
                    }
                    
                    if (PATH_TEXT) {
                        PATH_TEXT.innerText = "—";
                        PATH_TEXT.style.cursor = "default";
                        PATH_TEXT.style.textDecoration = "none";
                        PATH_TEXT.onclick = null;
                        PATH_TEXT.title = "";
                    }
                    break;
            }
        }

        setFavoriteState(isFav) {
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
    // 8. VIEW PAGE LOGIC CONTROLLER
    // ============================================================================

    class ViewPageController {
        constructor() {
            this.appId = null;
            this.appName = null;
            this.appIcon = null;
            this.syncTimer = null;
            this.aggressionLevel = 3; // Default
        }

        async init() {
            const appCard = document.querySelector(CONFIG.SELECTORS.APP_CARD_ROOT);
            if (!appCard) return;

            // 1. Extract Metadata
            this.appId = appCard.dataset.app;
            this.appName = document.querySelector(CONFIG.SELECTORS.APP_TITLE)?.innerText || "Unknown";
            this.appIcon = document.querySelector(CONFIG.SELECTORS.APP_IMG)?.src || "";

            logger.info(`Initializing View Page for: ${this.appName} (${this.appId})`);

            // 2. Load Settings for Aggression
            const settings = await bridge.getAppSettings();
            if (settings[CONFIG.SYNC.AGGRESSION_KEY]) {
                this.aggressionLevel = parseInt(settings[CONFIG.SYNC.AGGRESSION_KEY]);
            }

            // 3. Attach Event Listeners
            this.attachHandlers();

            // 4. Start Sync Loop
            this.startSync();

            // 5. Listen for Global Auth Changes to refresh state
            document.addEventListener('naro:auth-changed', (e) => {
                if (e.detail.user) {
                    this.checkRemoteStatus(e.detail.user.uid);
                    this.checkFavoriteStatus(e.detail.user.uid);
                } else {
                    uiState.updateStatus(CONFIG.STATUS.UNINSTALLED);
                    uiState.setFavoriteState(false);
                }
            });
        }

        attachHandlers() {
            const els = uiState.elements;

            // Download
            if (els.BTN_DOWNLOAD) {
                els.BTN_DOWNLOAD.onclick = Utils.debounce(() => {
                    if (!fbManager.currentUser) {
                        bridge.showToast("Please login to download.");
                        return;
                    }
                    
                    bridge.showToast("Download started...");
                    
                    // Optimistic update
                    uiState.updateStatus(CONFIG.STATUS.DOWNLOADING);

                    fbManager.updateHistory(this.appId, {
                        appName: this.appName,
                        appId: this.appId,
                        icon: this.appIcon,
                        timestamp: firebase.database.ServerValue.TIMESTAMP,
                        status: 'Downloading',
                        filename: this.appName + ".exe" // Fallback guess
                    });
                }, 300);
            }

            // Open
            if (els.BTN_OPEN) {
                els.BTN_OPEN.onclick = Utils.throttle(async () => {
                    bridge.showToast(`Launching ${this.appName}...`);
                    const success = await bridge.openApp(this.appName);
                    if (!success) bridge.showToast("Failed to launch app.");
                }, 2000);
            }

            // Uninstall
            if (els.BTN_UNINSTALL) {
                els.BTN_UNINSTALL.onclick = async (e) => {
                    e.preventDefault();
                    if (confirm(`Are you sure you want to uninstall ${this.appName}?`)) {
                        bridge.showToast("Uninstalling...");
                        const success = await bridge.uninstallApp(Utils.getCleanName(this.appName));
                        
                        if (success) {
                            uiState.updateStatus(CONFIG.STATUS.UNINSTALLED);
                            fbManager.updateHistory(this.appId, {
                                status: 'Uninstalled',
                                installLocation: null,
                                uninstalledDate: new Date().toISOString()
                            });
                        } else {
                            bridge.showToast("Uninstall failed or cancelled.");
                        }
                    }
                };
            }

            // Favorite
            if (els.BTN_FAV) {
                els.BTN_FAV.onclick = Utils.debounce(async () => {
                    const isNowFav = await fbManager.toggleFavorite(this.appId, {
                        appName: this.appName,
                        icon: this.appIcon,
                        appId: this.appId
                    });
                    if (isNowFav !== null) {
                        uiState.setFavoriteState(isNowFav);
                    }
                }, 300);
            }
        }

        startSync() {
            // Initial Check
            this.runSyncCycle();

            // Periodic Check
            this.syncTimer = setInterval(() => this.runSyncCycle(), CONFIG.SYNC.INTERVAL_MS);
        }

        async runSyncCycle() {
            if (document.hidden) return; // Save resources

            try {
                // 1. Check Local Filesystem (Truth)
                const localPath = await bridge.findPath(this.appName, this.aggressionLevel);
                
                // 2. Update UI based on Local Truth
                if (localPath) {
                    uiState.updateStatus(CONFIG.STATUS.INSTALLED, localPath);
                } else {
                    // Only set to uninstalled if we aren't currently downloading
                    // We check this by peeking at the UI or internal state
                    if (uiState.currentStatus !== CONFIG.STATUS.DOWNLOADING) {
                        uiState.updateStatus(CONFIG.STATUS.UNINSTALLED);
                    }
                }

                // 3. Sync Truth to Cloud (if logged in)
                if (fbManager.currentUser) {
                    if (localPath) {
                        fbManager.updateHistory(this.appId, {
                            status: 'Installed',
                            installLocation: localPath,
                            lastChecked: Date.now()
                        });
                    }
                }
            } catch (e) {
                logger.error("Sync Cycle Error", e);
            }
        }

        checkRemoteStatus(uid) {
            // Listen for changes from other devices or the main process
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
    // 9. PROFILE PAGE LOGIC CONTROLLER
    // ============================================================================

    class ProfilePageController {
        constructor() {
            this.processedApps = new Set();
        }

        init() {
            logger.info("Initializing Profile Page Controller");
            
            // Listen for Auth
            document.addEventListener('naro:auth-changed', (e) => {
                if (e.detail.user) {
                    this.startBatchSync(e.detail.user);
                }
            });

            // If already logged in
            if (fbManager.currentUser) {
                this.startBatchSync(fbManager.currentUser);
            }
        }

        async startBatchSync(user) {
            if (!user) return;
            
            logger.info("Starting batch sync for profile...");
            
            // Get all history
            const ref = fbManager.db.ref(`users/${user.uid}/history`);
            
            try {
                const snapshot = await ref.once('value');
                const historyData = snapshot.val();

                if (!historyData) return;

                const updates = {};
                let hasUpdates = false;

                // Iterate through all apps in history
                // Use Promise.all for parallel processing, but chunked to avoid IPC overload
                const keys = Object.keys(historyData);
                const chunks = this.chunkArray(keys, 5); // Process 5 apps at a time

                for (const chunk of chunks) {
                    await Promise.all(chunk.map(async (key) => {
                        const item = historyData[key];
                        const name = item.appName || item.filename;
                        
                        if (!name) return;

                        // Find path
                        const path = await bridge.findPath(name, 3); // Medium aggression for batch
                        
                        // Logic: Only update if status mismatch
                        const dbStatus = item.status;
                        const localStatus = path ? 'Installed' : 'Uninstalled';

                        // Ignore 'Downloading' status to prevent overwrites during download
                        if (dbStatus === 'Downloading') return;

                        if (path && dbStatus !== 'Installed') {
                            updates[`${key}/status`] = 'Installed';
                            updates[`${key}/installLocation`] = path;
                            updates[`${key}/lastChecked`] = Date.now();
                            hasUpdates = true;
                        } else if (!path && dbStatus === 'Installed') {
                            updates[`${key}/status`] = 'Uninstalled';
                            updates[`${key}/installLocation`] = null;
                            hasUpdates = true;
                        }
                    }));
                }

                if (hasUpdates) {
                    logger.success(`Batch sync: Updating ${Object.keys(updates).length} fields`);
                    await ref.update(updates);
                } else {
                    logger.info("Batch sync: No changes detected");
                }

            } catch (e) {
                logger.error("Batch sync failed", e);
            }
        }

        chunkArray(myArray, chunk_size) {
            let results = [];
            while (myArray.length) {
                results.push(myArray.splice(0, chunk_size));
            }
            return results;
        }
    }

    // ============================================================================
    // 10. NETWORK MONITOR (SPEEDOMETER)
    // ============================================================================
    // Adapted from renderer.js for pages that might need network awareness

    class NetworkMonitor {
        constructor() {
            this.connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            this.listeners = [];
            if (this.connection) {
                this.connection.addEventListener('change', () => this.update());
                this.update();
            }
        }

        update() {
            if (!this.connection) return;
            const data = {
                downlink: this.connection.downlink, // Mbps
                effectiveType: this.connection.effectiveType,
                rtt: this.connection.rtt
            };
            
            // Broadcast for any UI components that care
            document.dispatchEvent(new CustomEvent('naro:network-change', { detail: data }));
            
            if (CONFIG.DEBUG) {
                // logger.info("Network change", data);
            }
        }
    }
    
    // ============================================================================
    // 11. BOOTSTRAPPER
    // ============================================================================

    class AppBootstrapper {
        static async run() {
            const startT = performance.now();
            console.log(`%c NARO TRACKING v${CONFIG.VERSION} STARTING `, 'background: #222; color: #bada55');

            // 1. Initialize Firebase
            const fbReady = await fbManager.init();
            if (!fbReady) {
                logger.warn("Firebase deferred. Retrying in background...");
                setTimeout(AppBootstrapper.retryFirebase, 2000);
            }

            // 2. Initialize Network Monitor
            new NetworkMonitor();

            // 3. Determine Page Context
            const path = window.location.pathname;
            
            if (path.includes('view.html') || document.querySelector(CONFIG.SELECTORS.APP_CARD_ROOT)) {
                const viewController = new ViewPageController();
                viewController.init();
            } else if (path.includes('profile.html')) {
                const profileController = new ProfilePageController();
                profileController.init();
            }

            // 4. Expose Debug API
            window.NaroTracker = {
                getLogs: () => logger.exportLogs(),
                getState: () => ({
                    user: fbManager.currentUser,
                    isElectron: bridge.isElectron,
                    offlineQueue: offlineManager.queue
                })
            };

            const endT = performance.now();
            logger.info(`Boot process finished in ${(endT - startT).toFixed(2)}ms`);
        }

        static async retryFirebase() {
            const success = await fbManager.init();
            if (success) logger.success("Firebase connected on retry.");
        }
    }

    // ============================================================================
    // 12. EXECUTION ENTRY POINT
    // ============================================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', AppBootstrapper.run);
    } else {
        AppBootstrapper.run();
    }

    // Unhandled Rejection Catcher
    window.addEventListener('unhandledrejection', (event) => {
        logger.error('Unhandled Promise Rejection', event.reason);
    });

})();

/**
 * ============================================================================
 * END OF FILE
 * ============================================================================
 */