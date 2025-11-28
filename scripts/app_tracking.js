/**
 * ============================================================================
 * APP TRACKING SYSTEM - ADVANCED CORE
 * ============================================================================
 * File: app_tracking.js
 * Version: 2.5.0 (Optimized/Enterprise)
 * Description: 
 * Handles synchronization between Local Electron Environment,
 * Firebase Realtime Database, and the Web UI.
 * Includes offline queuing, heuristic app detection, and aggressive caching.
 * * Dependencies:
 * - Firebase Modular SDK (Auth, Database)
 * - Electron Preload API (window.appAPI)
 * * Author: Gemini
 * Optimization Level: Extreme
 * ============================================================================
 */

import { mainAuth, mainDb } from './firebase-config.js';
import { 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    ref, 
    update, 
    onValue, 
    get, 
    set, 
    remove, 
    query, 
    orderByChild, 
    serverTimestamp,
    limitToLast 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// ============================================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
    // Sync Behavior
    SYNC_INTERVAL_MS: 3000,
    LONG_POLL_INTERVAL_MS: 15000,
    MAX_RETRY_ATTEMPTS: 5,
    DEBOUNCE_DELAY_MS: 300,
    
    // Cache Keys
    CACHE_KEY_PREFIX: 'naro_track_',
    QUEUE_KEY: 'naro_sync_queue',
    
    // Aggression Levels (Matching renderer.js)
    AGGRESSION: {
        LOW: 1,      // Registry Only
        NORMAL: 2,   // Registry + Start Menu
        MEDIUM: 3,   // Reg + Start + Desktop
        HIGH: 4,     // Deep Search Common Folders
        EXTREME: 5   // Recursive (Heavy)
    },

    // Status Constants
    STATUS: {
        UNKNOWN: 'unknown',
        NOT_INSTALLED: 'not_installed',
        DOWNLOADING: 'downloading',
        INSTALLING: 'installing',
        INSTALLED: 'installed',
        UNINSTALLED: 'uninstalled',
        UPDATE_AVAILABLE: 'update_available',
        ERROR: 'error'
    },

    // Regex Patterns
    PATTERNS: {
        CLEANER: / pc$| edition$| app$| software$| v\d+(\.\d+)*$/i,
        NON_ALPHANUM: /[^a-z0-9]/g,
        VERSION: /\d+(\.\d+)+/
    }
};

// ============================================================================
// 2. LOGGING & DIAGNOSTICS UTILITY
// ============================================================================

class Logger {
    constructor(scope = 'AppTracking') {
        this.scope = scope;
        this.enabled = true;
    }

    _format(level, message, data) {
        const timestamp = new Date().toISOString();
        const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
        return `[${timestamp}] [${this.scope}] [${level}] ${message}${dataStr}`;
    }

    info(message, data = null) {
        if (!this.enabled) return;
        console.log(`%c${this._format('INFO', message, data)}`, 'color: #2196f3');
    }

    success(message, data = null) {
        if (!this.enabled) return;
        console.log(`%c${this._format('SUCCESS', message, data)}`, 'color: #4caf50; font-weight: bold;');
    }

    warn(message, data = null) {
        if (!this.enabled) return;
        console.warn(`%c${this._format('WARN', message, data)}`, 'color: #ff9800');
    }

    error(message, error = null) {
        console.error(`%c${this._format('ERROR', message)}`, 'color: #f44336; font-weight: bold;', error);
    }

    debug(message, data = null) {
        if (!this.enabled) return;
        // Only show debug logs if explicitly requested or in dev environment
        if (localStorage.getItem('debugMode') === 'true') {
            console.debug(`%c${this._format('DEBUG', message, data)}`, 'color: #9e9e9e');
        }
    }
}

const logger = new Logger('TrackerCore');

// ============================================================================
// 3. UTILITY HELPER FUNCTIONS
// ============================================================================

/**
 * Standardizes app names for comparison logic.
 * Removes "PC", "Edition", "Software" and special characters.
 * @param {string} rawName - The original app name.
 * @returns {string} The cleaned, lowercase name.
 */
function normalizeAppName(rawName) {
    if (!rawName) return "";
    return rawName.toLowerCase()
        .replace(CONFIG.PATTERNS.CLEANER, '')
        .replace(CONFIG.PATTERNS.NON_ALPHANUM, '')
        .trim();
}

/**
 * Generates a unique transaction ID for sync events.
 * @returns {string} A random string.
 */
function generateTxId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Creates a promise that resolves after a set time.
 * @param {number} ms - Milliseconds to sleep.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function to limit rate of execution.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - Wait time in ms.
 */
function debounce(func, wait) {
    let timeout;
    // FIXED: changed 'functionExecutedFunction' to 'function'
    return function(...args) { 
        const later = () => {
            clearTimeout(timeout);
            // Optional: Use 'func.apply(this, args)' to preserve 'this' context
            func(...args); 
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Safe JSON parser.
 * @param {string} str - JSON string.
 * @param {any} fallback - Value to return on failure.
 */
function safeParse(str, fallback = {}) {
    try {
        return JSON.parse(str) || fallback;
    } catch (e) {
        return fallback;
    }
}

// ============================================================================
// 4. OFFLINE SYNC QUEUE SYSTEM
// ============================================================================

class SyncQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.loadFromDisk();
        
        // Listen for online status
        window.addEventListener('online', () => this.processQueue());
        window.addEventListener('offline', () => logger.warn('Network lost. Queuing updates.'));
    }

    loadFromDisk() {
        const stored = localStorage.getItem(CONFIG.QUEUE_KEY);
        this.queue = safeParse(stored, []);
        logger.debug(`Loaded ${this.queue.length} items from sync queue.`);
    }

    saveToDisk() {
        try {
            localStorage.setItem(CONFIG.QUEUE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            logger.error('Failed to save sync queue to disk', e);
        }
    }

    /**
     * Add an item to the sync queue.
     * @param {string} type - 'UPDATE_STATUS' | 'ADD_HISTORY' | 'REMOVE_FAVORITE'
     * @param {object} payload - The data for the operation.
     */
    enqueue(type, payload) {
        const item = {
            id: generateTxId(),
            timestamp: Date.now(),
            type,
            payload,
            retryCount: 0
        };
        
        this.queue.push(item);
        this.saveToDisk();
        
        if (navigator.onLine) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0 || !navigator.onLine) return;

        this.isProcessing = true;
        logger.info(`Processing ${this.queue.length} queued items...`);

        const remainingQueue = [];

        for (const item of this.queue) {
            try {
                await this.executeItem(item);
            } catch (error) {
                logger.error(`Failed to process item ${item.id}`, error);
                item.retryCount++;
                if (item.retryCount <= CONFIG.MAX_RETRY_ATTEMPTS) {
                    remainingQueue.push(item);
                } else {
                    logger.warn(`Dropping item ${item.id} after max retries.`);
                }
            }
        }

        this.queue = remainingQueue;
        this.saveToDisk();
        this.isProcessing = false;

        // If items remain, try again shortly
        if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 5000);
        }
    }

    async executeItem(item) {
        const { type, payload } = item;
        const user = mainAuth.currentUser;
        
        if (!user) throw new Error("No user authenticated during queue processing");

        switch (type) {
            case 'UPDATE_STATUS':
                await update(ref(mainDb, payload.path), payload.data);
                break;
            case 'SET_DATA':
                await set(ref(mainDb, payload.path), payload.data);
                break;
            case 'REMOVE_DATA':
                await remove(ref(mainDb, payload.path));
                break;
            default:
                logger.warn(`Unknown queue item type: ${type}`);
        }
    }
}

const syncQueue = new SyncQueue();

// ============================================================================
// 5. ELECTRON BRIDGE (IPC WRAPPER)
// ============================================================================

class ElectronBridge {
    constructor() {
        this.api = window.appAPI;
        this.isAvailable = !!(this.api && this.api.findAppPath);
        
        if (!this.isAvailable) {
            logger.warn('Running in Browser Mode (No Electron API detected).');
        } else {
            logger.success('Electron API Bridge Connected.');
        }
    }

    /**
     * Wraps API calls to ensure safety and logging.
     * @param {string} methodName 
     * @param {...any} args 
     */
    async _call(methodName, ...args) {
        if (!this.isAvailable) return null;
        if (typeof this.api[methodName] !== 'function') {
            logger.error(`Method ${methodName} not found in appAPI`);
            return null;
        }

        try {
            const start = performance.now();
            const result = await this.api[methodName](...args);
            const duration = (performance.now() - start).toFixed(2);
            
            // Log slow operations
            if (duration > 100) {
                logger.debug(`Slow IPC Call: ${methodName} took ${duration}ms`);
            }
            return result;
        } catch (error) {
            logger.error(`IPC Call failed: ${methodName}`, error);
            return null;
        }
    }

    async findAppPath(appName, aggressionLevel = CONFIG.AGGRESSION.NORMAL) {
        return this._call('findPath', appName, aggressionLevel);
    }

    async getAppSettings() {
        return this._call('getAppSettings') || {};
    }

    async installApp(filePath) {
        return this._call('installApp', filePath);
    }

    async uninstallApp(appName) {
        return this._call('uninstallApp', appName);
    }

    async openApp(appName) {
        return this._call('openApp', appName);
    }

    async openFileLocation(path) {
        return this._call('openFileLocation', path);
    }

    onInstallStart(callback) {
        if (this.isAvailable && this.api.onInstallStartSignal) {
            this.api.onInstallStartSignal(callback);
        }
    }
}

const electron = new ElectronBridge();

// ============================================================================
// 6. INTELLIGENT APP FINDER
// ============================================================================

class AppFinder {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 10000; // 10 seconds cache for paths
    }

    /**
     * Intelligent search that tries multiple naming conventions.
     * @param {string} originalName 
     * @returns {Promise<string|null>} The path if found, null otherwise.
     */
    async findPath(originalName) {
        if (!electron.isAvailable) return null;

        // Check internal memory cache first
        const cached = this.cache.get(originalName);
        if (cached && (Date.now() - cached.timestamp < this.cacheDuration)) {
            return cached.path;
        }

        let path = null;
        const settings = await electron.getAppSettings();
        const aggression = settings.syncAggression || CONFIG.AGGRESSION.NORMAL;

        logger.debug(`Searching for "${originalName}" with aggression ${aggression}`);

        // Strategy 1: Exact Name
        path = await electron.findAppPath(originalName, aggression);

        // Strategy 2: Cleaned Name (No "PC", "Edition")
        if (!path) {
            const cleanName = originalName
                .replace(/ PC$/i, "")
                .replace(/ Edition$/i, "")
                .replace(/ Software$/i, "")
                .replace(/ App$/i, "");
            
            if (cleanName !== originalName) {
                path = await electron.findAppPath(cleanName, aggression);
            }
        }

        // Strategy 3: Normalized Name (Alpha-numeric only)
        if (!path) {
            const normalized = normalizeAppName(originalName);
            if (normalized.length > 3) { // Avoid searching for "a", "the"
                 // Note: appAPI might not support fuzzy, but we pass it anyway just in case the backend does
                path = await electron.findAppPath(normalized, aggression);
            }
        }

        // Update Cache
        this.cache.set(originalName, {
            path: path,
            timestamp: Date.now()
        });

        if (path) {
            logger.info(`Found app "${originalName}" at: ${path}`);
        }

        return path;
    }

    invalidateCache(appName) {
        this.cache.delete(appName);
    }
}

const appFinder = new AppFinder();

// ============================================================================
// 7. VIEW PAGE CONTROLLER (Single App Logic)
// ============================================================================

class ViewPageController {
    constructor() {
        this.elements = {};
        this.state = {
            appId: null,
            appName: null,
            appIcon: null,
            lastServerUpdate: null,
            currentPath: null,
            isInstalled: false,
            firebaseStatus: null
        };
        this.listeners = [];
    }

    init() {
        // DOM Elements Binding
        this.elements = {
            card: document.querySelector('#app-card-root'),
            title: document.getElementById('d-app-title'),
            icon: document.getElementById('d-app-image'),
            
            // Buttons
            btnDownload: document.getElementById('d-btn-download'),
            btnOpen: document.getElementById('d-btn-open'),
            btnUpdate: document.getElementById('d-btn-update'),
            btnUninstall: document.getElementById('d-btn-uninstall'),
            btnFav: document.getElementById('d-btn-fav'),
            
            // Status Info
            statusText: document.getElementById('install-status-dynamic'),
            pathLink: document.getElementById('loc-path-dynamic'),
            
            // Modals (if any exist on page)
            installModal: document.getElementById('installModal')
        };

        if (!this.elements.card) {
            logger.debug('No app card found, skipping ViewPage init.');
            return;
        }

        // Extract Initial Data
        this.state.appId = this.elements.card.dataset.app;
        this.state.lastServerUpdate = this.elements.card.getAttribute('data-last-updated') || "";
        this.state.appName = this.elements.title ? this.elements.title.innerText : "Unknown App";
        this.state.appIcon = this.elements.icon ? this.elements.icon.src : "";

        logger.info(`ViewPage initialized for: ${this.state.appName} (${this.state.appId})`);

        this._attachEventHandlers();
        this._startSyncLoop();
        this._listenForInstallSignals();
    }

    _attachEventHandlers() {
        // 1. Download
        if (this.elements.btnDownload) {
            this.elements.btnDownload.addEventListener('click', () => this._handleDownload());
        }

        // 2. Open
        if (this.elements.btnOpen) {
            this.elements.btnOpen.addEventListener('click', () => this._handleOpen());
        }

        // 3. Uninstall
        if (this.elements.btnUninstall) {
            this.elements.btnUninstall.addEventListener('click', (e) => this._handleUninstall(e));
        }

        // 4. Favorite
        if (this.elements.btnFav) {
            this.elements.btnFav.addEventListener('click', () => this._handleFavorite());
        }
    }

    async _handleDownload() {
        const user = mainAuth.currentUser;
        if (!user || user.isAnonymous) {
            this._showToast("Please sign in to track downloads.", "warning");
            return;
        }

        // Optimistic UI update
        this._updateUIStatus(CONFIG.STATUS.DOWNLOADING);

        const path = `users/${user.uid}/history/${this.state.appId}`;
        const payload = {
            appName: this.state.appName,
            appId: this.state.appId,
            icon: this.state.appIcon,
            timestamp: serverTimestamp(),
            status: CONFIG.STATUS.DOWNLOADING
        };

        syncQueue.enqueue('UPDATE_STATUS', { path, data: payload });
        logger.info('Download started, history update queued.');
    }

    async _handleOpen() {
        if (!electron.isAvailable) {
            this._showToast("Opening apps only supported in Desktop App.", "error");
            return;
        }

        this._showToast(`Opening ${this.state.appName}...`);
        
        let result = await electron.openApp(this.state.appName);
        
        // Retry with simplified name if exact fail
        if (!result) {
            const simpleName = this.state.appName.replace(/ PC$/i, "").replace(/ Edition$/i, "");
            result = await electron.openApp(simpleName);
        }

        if (!result && this.state.currentPath) {
            // Fallback: Try opening the file path directly
            // Not a direct API method in this version, but conceptually sound fallback
            logger.warn("Open by name failed, path exists though.");
        }
    }

    async _handleUninstall(e) {
        e.preventDefault();
        
        if (!confirm(`Are you sure you want to uninstall ${this.state.appName}?`)) return;

        if (electron.isAvailable) {
            const simpleName = this.state.appName.replace(/ PC$/i, "").replace(/ Edition$/i, "");
            await electron.uninstallApp(simpleName);
            this._showToast("Uninstall command sent.");
            
            // Assume success for UI temporarily, actual check happens in polling loop
            this._updateUIStatus(CONFIG.STATUS.UNINSTALLED);
            
            // Update DB
            const user = mainAuth.currentUser;
            if (user) {
                const path = `users/${user.uid}/history/${this.state.appId}`;
                syncQueue.enqueue('UPDATE_STATUS', { 
                    path, 
                    data: { 
                        status: 'Uninstalled', 
                        installLocation: null,
                        lastChecked: Date.now() 
                    } 
                });
            }
        }
    }

    async _handleFavorite() {
        const user = mainAuth.currentUser;
        if (!user || user.isAnonymous) {
            this._showToast("Login required for favorites.", "error");
            return;
        }

        const favRefPath = `users/${user.uid}/favorites/${this.state.appId}`;
        const favBtn = this.elements.btnFav;
        const isCurrentlyFav = favBtn.classList.contains('active');

        // Optimistic Toggle
        this._toggleFavIcon(!isCurrentlyFav);

        if (isCurrentlyFav) {
            // Remove
            syncQueue.enqueue('REMOVE_DATA', { path: favRefPath });
            this._showToast("Removed from favorites");
        } else {
            // Add
            syncQueue.enqueue('SET_DATA', {
                path: favRefPath,
                data: {
                    appName: this.state.appName,
                    appId: this.state.appId,
                    icon: this.state.appIcon,
                    timestamp: Date.now()
                }
            });
            this._showToast("Added to favorites");
        }
    }

    _toggleFavIcon(isActive) {
        if (!this.elements.btnFav) return;
        const icon = this.elements.btnFav.querySelector('i');
        
        if (isActive) {
            this.elements.btnFav.classList.add('active');
            if (icon) {
                icon.classList.remove('fa-regular');
                icon.classList.add('fa-solid');
            }
        } else {
            this.elements.btnFav.classList.remove('active');
            if (icon) {
                icon.classList.remove('fa-solid');
                icon.classList.add('fa-regular');
            }
        }
    }

    _listenForInstallSignals() {
        electron.onInstallStart((data) => {
            const incomingName = normalizeAppName(data.appName);
            const thisName = normalizeAppName(this.state.appName);

            if (incomingName === thisName) {
                logger.info("Install signal received for current page app.");
                this._updateUIStatus(CONFIG.STATUS.INSTALLING);
                this._monitorInstallation(data.appName);
            }
        });
    }

    async _monitorInstallation(targetAppName) {
        // Poll aggressively for 60 seconds
        let attempts = 0;
        const maxAttempts = 30; // 30 * 2000ms = 60s
        
        const interval = setInterval(async () => {
            attempts++;
            const path = await appFinder.findPath(this.state.appName); // Use original name for finding
            
            if (path) {
                clearInterval(interval);
                this.state.currentPath = path;
                this.state.isInstalled = true;
                
                this._updateUIStatus(CONFIG.STATUS.INSTALLED, path);
                this._showToast(`${this.state.appName} installed successfully!`, "success");
                
                // Final DB Update
                const user = mainAuth.currentUser;
                if (user) {
                    this._syncToFirebase(user, path, CONFIG.STATUS.INSTALLED);
                }
            }

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                if (!path) {
                    this._showToast("Installation check timed out. Please refresh manually.", "warning");
                }
            }
        }, 2000);
    }

    _startSyncLoop() {
        onAuthStateChanged(mainAuth, (user) => {
            if (user && !user.isAnonymous) {
                logger.info(`User ${user.uid} authenticated. Starting sync.`);
                
                // 1. Sync Favorites
                const favRef = ref(mainDb, `users/${user.uid}/favorites/${this.state.appId}`);
                onValue(favRef, (snap) => this._toggleFavIcon(snap.exists()));

                // 2. Sync History/Status
                const historyRef = ref(mainDb, `users/${user.uid}/history`);
                onValue(historyRef, async (snapshot) => {
                    const data = snapshot.val() || {};
                    let myRecord = data[this.state.appId];

                    // Fallback: Search by name if ID miss
                    if (!myRecord) {
                        const cleanTarget = normalizeAppName(this.state.appName);
                        const foundKey = Object.keys(data).find(k => {
                            const item = data[k];
                            return normalizeAppName(item.appName) === cleanTarget;
                        });
                        if (foundKey) myRecord = data[foundKey];
                    }

                    this.state.firebaseStatus = myRecord;
                    await this._reconcileState(user, myRecord);
                });

            } else {
                // Guest / Logged Out
                logger.info("Guest mode active.");
                this._toggleFavIcon(false);
                this._checkLocalOnly();
            }
        });
    }

    /**
     * The Brain: Decides whether to trust Local Machine or Firebase
     */
    async _reconcileState(user, firebaseRecord) {
        if (!electron.isAvailable) {
            // Browser Mode: Trust Firebase completely
            if (firebaseRecord && firebaseRecord.status === 'Installed') {
                this._updateUIStatus(CONFIG.STATUS.INSTALLED, firebaseRecord.installLocation);
            } else {
                this._updateUIStatus(CONFIG.STATUS.NOT_INSTALLED);
            }
            return;
        }

        // Electron Mode: Local Reality checks
        const localPath = await appFinder.findPath(this.state.appName);
        
        if (localPath) {
            // It IS installed locally
            const isUpdateAvailable = (
                this.state.lastServerUpdate && 
                firebaseRecord?.installedDate && 
                this.state.lastServerUpdate !== firebaseRecord.installedDate
            );

            this.state.currentPath = localPath;
            this.state.isInstalled = true;

            this._updateUIStatus(
                isUpdateAvailable ? CONFIG.STATUS.UPDATE_AVAILABLE : CONFIG.STATUS.INSTALLED, 
                localPath
            );

            // If Firebase disagrees or is missing data, update Firebase
            if (
                !firebaseRecord || 
                firebaseRecord.status !== 'Installed' || 
                firebaseRecord.installLocation !== localPath
            ) {
                logger.info("Reconcile: Local file found, updating Firebase.");
                this._syncToFirebase(user, localPath, 'Installed');
            }

        } else {
            // It is NOT installed locally
            this.state.currentPath = null;
            this.state.isInstalled = false;
            this._updateUIStatus(CONFIG.STATUS.NOT_INSTALLED);

            // If Firebase thinks it's installed, correct it
            if (firebaseRecord && (firebaseRecord.status === 'Installed')) {
                logger.warn("Reconcile: File missing locally. Downgrading Firebase status.");
                this._syncToFirebase(user, null, 'Uninstalled');
            }
        }
    }

    async _checkLocalOnly() {
        if (!electron.isAvailable) {
            this._updateUIStatus(CONFIG.STATUS.NOT_INSTALLED);
            return;
        }
        
        const path = await appFinder.findPath(this.state.appName);
        if (path) {
            this.state.currentPath = path;
            this.state.isInstalled = true;
            this._updateUIStatus(CONFIG.STATUS.INSTALLED, path);
        } else {
            this._updateUIStatus(CONFIG.STATUS.NOT_INSTALLED);
        }
    }

    _syncToFirebase(user, location, status) {
        const path = `users/${user.uid}/history/${this.state.appId}`;
        const data = {
            status: status,
            installLocation: location || null,
            timestamp: serverTimestamp(),
            lastChecked: Date.now()
        };
        
        if (status === 'Installed') {
            data.installedDate = this.state.lastServerUpdate || new Date().toLocaleDateString();
        }

        syncQueue.enqueue('UPDATE_STATUS', { path, data });
    }

    _updateUIStatus(status, location = null) {
        const { btnDownload, btnOpen, btnUpdate, btnUninstall, statusText, pathLink } = this.elements;

        // Reset all first
        const hide = (el) => { if (el) el.style.display = 'none'; };
        const show = (el) => { if (el) el.style.display = 'inline-flex'; };

        [btnDownload, btnOpen, btnUpdate, btnUninstall].forEach(hide);

        let statusMessage = "Unknown";
        let statusColor = "#aaa";

        switch (status) {
            case CONFIG.STATUS.INSTALLED:
                show(btnOpen);
                show(btnUninstall);
                statusMessage = "Installed";
                statusColor = "#00e676";
                break;
            
            case CONFIG.STATUS.UPDATE_AVAILABLE:
                show(btnOpen);
                show(btnUpdate);
                show(btnUninstall);
                statusMessage = "Update Available";
                statusColor = "#ffea00";
                break;

            case CONFIG.STATUS.INSTALLING:
                statusMessage = "Installing...";
                statusColor = "#29b6f6";
                // Show nothing clickable
                break;

            case CONFIG.STATUS.DOWNLOADING:
                statusMessage = "Downloading...";
                statusColor = "#29b6f6";
                break;

            case CONFIG.STATUS.NOT_INSTALLED:
            case CONFIG.STATUS.UNINSTALLED:
            default:
                show(btnDownload);
                statusMessage = "Not Installed";
                statusColor = "#d32f2f";
                break;
        }

        if (statusText) {
            statusText.innerHTML = `<span style="color:${statusColor}; font-weight:bold;">${statusMessage}</span>`;
        }

        if (pathLink) {
            if (location) {
                pathLink.innerText = location.length > 30 ? "..." + location.slice(-27) : location;
                pathLink.title = location;
                pathLink.onclick = () => electron.openFileLocation(location);
                pathLink.style.cursor = "pointer";
                pathLink.style.textDecoration = "underline";
            } else {
                pathLink.innerText = "—";
                pathLink.onclick = null;
                pathLink.style.cursor = "default";
                pathLink.style.textDecoration = "none";
            }
        }
    }

    _showToast(msg, type = "info") {
        if (typeof window.showToast === 'function') {
            window.showToast(msg); // Use global renderer toast if available
        } else {
            console.log(`[TOAST-${type}]: ${msg}`);
            // Basic fallback toast
            const t = document.createElement('div');
            t.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; 
                background: #333; color: #fff; padding: 10px 20px; 
                border-radius: 5px; z-index: 9999; animation: fadein 0.3s;
                border-left: 4px solid ${type === 'error' ? '#f44336' : '#00e676'};
            `;
            t.innerText = msg;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 3000);
        }
    }
}

// ============================================================================
// 8. PROFILE PAGE CONTROLLER (Bulk Sync Logic)
// ============================================================================

class ProfilePageController {
    constructor() {
        this.isScanning = false;
    }

    init() {
        logger.info("Profile Sync Controller initialized.");
        
        onAuthStateChanged(mainAuth, (user) => {
            if (user && !user.isAnonymous) {
                this._startFullLibraryScan(user);
            }
        });
    }

    /**
     * Iterates through ALL apps in user history and validates their status against local disk.
     */
    async _startFullLibraryScan(user) {
        if (!electron.isAvailable) return;
        if (this.isScanning) return;
        
        this.isScanning = true;
        const historyRef = ref(mainDb, `users/${user.uid}/history`);

        logger.info("Starting Full Library Scan...");

        onValue(historyRef, async (snapshot) => {
            const history = snapshot.val();
            if (!history) {
                this.isScanning = false;
                return;
            }

            const updates = {};
            let changeCount = 0;

            // Process sequentially to avoid IO flooding
            for (const key of Object.keys(history)) {
                const item = history[key];
                
                // Skip items we just checked recently (optimization)
                const lastChecked = item.lastChecked || 0;
                if (Date.now() - lastChecked < CONFIG.LONG_POLL_INTERVAL_MS) continue;

                const appName = item.appName || item.filename;
                const path = await appFinder.findPath(appName);
                
                const currentStatus = item.status?.toLowerCase();
                const isInstalledDB = currentStatus === 'installed';
                const isInstalledLocal = !!path;

                // Case 1: DB says installed, but missing locally -> Mark Uninstalled
                if (isInstalledDB && !isInstalledLocal) {
                    updates[`${key}/status`] = 'Uninstalled';
                    updates[`${key}/installLocation`] = null;
                    updates[`${key}/lastChecked`] = serverTimestamp();
                    changeCount++;
                    logger.debug(`Scan: ${appName} missing locally. Marking uninstalled.`);
                }
                
                // Case 2: Found locally, but DB says otherwise -> Mark Installed
                else if (isInstalledLocal && !isInstalledDB) {
                    updates[`${key}/status`] = 'Installed';
                    updates[`${key}/installLocation`] = path;
                    updates[`${key}/lastChecked`] = serverTimestamp();
                    changeCount++;
                    logger.debug(`Scan: ${appName} found at ${path}. Marking installed.`);
                }
                
                // Case 3: Path changed
                else if (isInstalledLocal && item.installLocation !== path) {
                    updates[`${key}/installLocation`] = path;
                    updates[`${key}/lastChecked`] = serverTimestamp();
                    changeCount++;
                }
                
                // Case 4: No Change, just update timestamp
                else {
                    // Only update timestamp occasionally to save writes
                    if (Date.now() - lastChecked > 3600000) { // 1 hour
                        updates[`${key}/lastChecked`] = serverTimestamp();
                        changeCount++;
                    }
                }

                // Small delay to prevent UI freeze
                await sleep(50); 
            }

            if (changeCount > 0) {
                logger.info(`Profile Scan Complete. Committing ${changeCount} updates.`);
                try {
                    await update(historyRef, updates);
                } catch (e) {
                    logger.error("Failed to commit profile scan updates", e);
                }
            } else {
                logger.debug("Profile Scan Complete. No changes.");
            }
            
            this.isScanning = false;

        }, { onlyOnce: true }); // Important: Only run scan once per load/auth change
    }
}

// ============================================================================
// 9. ROUTER & INITIALIZATION
// ============================================================================

const viewPage = new ViewPageController();
const profilePage = new ProfilePageController();

/**
 * Main Entry Point
 */
function initialize() {
    const path = window.location.pathname;

    logger.info(`Initializing App Tracking for path: ${path}`);

    // Detect environment
    if (document.documentElement.getAttribute('data-platform') === 'electron') {
        // Platform specific logic if needed
    }

    if (path.includes('view.html')) {
        // We are on a single app details page
        viewPage.init();
    } 
    else if (path.includes('profile.html')) {
        // We are on the user profile page
        profilePage.init();
    }
    else if (path.includes('library.html') || path.includes('downloads.html')) {
        // Future expansion: Library specific tracking
        profilePage.init(); // Reuse profile sync logic for library
    }
}

// Global Error Handler for tracking script
window.addEventListener('error', (event) => {
    logger.error('Uncaught Exception in AppTracking', event.error);
});

// Run Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// ============================================================================
// 10. PUBLIC API EXPORTS
// ============================================================================

/**
 * Exposed functions for other scripts to use if necessary.
 * Attached to window.NaroTracker namespace.
 */
window.NaroTracker = {
    checkAppStatus: async (appName) => {
        return await appFinder.findPath(appName);
    },
    
    forceSync: () => {
        if (mainAuth.currentUser) {
            profilePage._startFullLibraryScan(mainAuth.currentUser);
        }
    },
    
    getQueueStatus: () => {
        return {
            pending: syncQueue.queue.length,
            isProcessing: syncQueue.isProcessing
        };
    },

    clearCache: () => {
        appFinder.cache.clear();
        logger.info("Cache cleared.");
    }
};

export { 
    viewPage, 
    profilePage, 
    electron, 
    logger 
};