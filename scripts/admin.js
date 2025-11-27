import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, writeBatch, getDocs, orderBy, getDoc as getDocFS } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDatabase, ref as dbRef, onValue, update as updateRTDB, runTransaction, get, set as setRTDB } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyCtX1G_OEXmkKtBNGzWQFEYiEWibrMIFrg",
    authDomain: "user-getnaro.firebaseapp.com",
    databaseURL: "https://user-getnaro-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "user-getnaro",
    storageBucket: "user-getnaro.firebasestorage.app",
    messagingSenderId: "264425704576",
    appId: "1:264425704576:web:cfd98a1f627e9a59cc2a65"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const firestore = getFirestore(app);
const rtdb = getDatabase(app);

// --- SECURITY WHITELIST ---
const ALLOWED_ADMINS = ["admin@getnaro.in", "admin@narotech.in", "vimalesh@admin.in"];

// --- CUSTOM ALERT SYSTEM ---
const modal = document.getElementById('custom-modal');
const userDetailModal = document.getElementById('user-detail-modal');
const modalTitle = document.getElementById('modal-title');
const modalMsg = document.getElementById('modal-msg');
const modalInputDiv = document.getElementById('modal-input-container');
const modalInput = document.getElementById('modal-input');
const btnConfirm = document.getElementById('modal-confirm');
const btnCancel = document.getElementById('modal-cancel');

function showCustomPopup(title, msg, type, callback) {
    modalTitle.textContent = title;
    modalMsg.textContent = msg;
    modal.style.display = 'flex';
    
    modalInputDiv.classList.add('hidden');
    btnCancel.classList.remove('hidden');
    
    if (type === 'alert') {
        btnCancel.classList.add('hidden');
        btnConfirm.textContent = "OK";
        btnConfirm.onclick = () => { modal.style.display = 'none'; if(callback) callback(); };
    } else if (type === 'confirm') {
        btnConfirm.textContent = "Yes";
        btnConfirm.onclick = () => { modal.style.display = 'none'; if(callback) callback(true); };
        btnCancel.onclick = () => { modal.style.display = 'none'; if(callback) callback(false); };
    } else if (type === 'prompt') {
        modalInputDiv.classList.remove('hidden');
        modalInput.value = '';
        modalInput.focus();
        btnConfirm.textContent = "Submit";
        btnConfirm.onclick = () => { modal.style.display = 'none'; if(callback) callback(modalInput.value); };
        btnCancel.onclick = () => { modal.style.display = 'none'; if(callback) callback(null); };
    }
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('admin-toast');
    const span = document.getElementById('toast-msg');
    span.textContent = msg;
    toast.style.borderColor = type === 'error' ? '#ef4444' : (type === 'success' ? '#00e676' : '#9F00FF');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- DOM Elements ---
const els = {
    loginSection: document.getElementById('login-section'),
    dashboard: document.getElementById('dashboard-content'),
    email: document.getElementById('admin-email'),
    pass: document.getElementById('admin-pass'),
    loginBtn: document.getElementById('admin-login-btn'),
    loginMsg: document.getElementById('login-msg'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // Stats
    stats: {
        apps: document.getElementById('total-apps-count'),
        downloads: document.getElementById('global-downloads-count'),
        liveVisitors: document.getElementById('live-visitors-count'),
        peakVisitors: document.getElementById('peak-visitors-count'),
        rtdbStatus: document.getElementById('rtdb-status'),
        rtdbLastUpdate: document.getElementById('rtdb-last-update'),
        authUsers: document.getElementById('auth-user-count'),
        totalVisits: document.getElementById('total-visits-count'),
        appsNeedingUpdate: document.getElementById('apps-needing-update')
    },

    // Tabs
    tabButtons: document.querySelectorAll('.tab-button'),
    tabContents: document.querySelectorAll('.tab-content'),

    // App Editor
    saveBtn: document.getElementById('save-app-btn'),
    clearBtn: document.getElementById('clear-form-btn'),
    tableBody: document.getElementById('app-table-body'),
    search: document.getElementById('search-apps'),
    importToggleBtn: document.getElementById('import-toggle-btn'),
    importSection: document.getElementById('import-section'),
    importJsonData: document.getElementById('import-json-data'),
    importFileInput: document.getElementById('import-file'),
    runImportBtn: document.getElementById('run-import-btn'),
    cancelImportBtn: document.getElementById('cancel-import-btn'),
    importStatus: document.getElementById('import-status'),
    deleteAllBtn: document.getElementById('delete-all-btn'),
    inputs: {
        docId: document.getElementById('app-doc-id'),
        id: document.getElementById('app-id'),
        name: document.getElementById('app-name'),
        category: document.getElementById('app-category'),
        version: document.getElementById('app-version'),
        tags: document.getElementById('app-tags'),
        desc: document.getElementById('app-desc'),
        link: document.getElementById('app-download-link'),
        image: document.getElementById('app-image')
    },
    
    // User Manager
    userSearchInput: document.getElementById('user-search-input'),
    searchUserBtn: document.getElementById('search-user-btn'),
    userResultCard: document.getElementById('user-result-card'),
    userDisplayName: document.getElementById('user-display-name'),
    userEmailId: document.getElementById('user-email-id'),
    userDeleteBtn: document.getElementById('user-delete-btn'),
    userDownloadHistory: document.getElementById('user-download-history'),
    userFavourites: document.getElementById('user-favourites'),
    userDataWarning: document.getElementById('user-data-warning'),
    userViewDetailsBtn: document.getElementById('user-view-details-btn'),

    // Config
    resetPeakBtn: document.getElementById('reset-peak-btn'),
    toggleSignups: document.getElementById('toggle-signups'),
    toggleMaintenance: document.getElementById('toggle-maintenance'),
    toggleSeo: document.getElementById('toggle-seo'),
    toggleCache: document.getElementById('toggle-cache'),
    configStatusMsg: document.getElementById('config-status-msg'),

    // Patch Notes
    patchTableBody: document.getElementById('patch-table-body'),
    btnNewPatch: document.getElementById('btn-new-patch'),
    patchEditorSection: document.getElementById('patch-editor-section'),
    patchListSection: document.getElementById('patch-list-section'),
    patchForm: {
        docId: document.getElementById('patch-doc-id'),
        version: document.getElementById('patch-version'),
        date: document.getElementById('patch-date'),
        category: document.getElementById('patch-category'),
        borderColor: document.getElementById('patch-border-color'),
        blocksContainer: document.getElementById('patch-blocks-container'),
        addHeadingBtn: document.getElementById('add-block-heading'),
        addParaBtn: document.getElementById('add-block-para'),
        addImageBtn: document.getElementById('add-block-image'),
        addListBtn: document.getElementById('add-block-list'),
        addSubBoxBtn: document.getElementById('add-block-subbox'),
        saveBtn: document.getElementById('save-patch-btn'),
        cancelBtn: document.getElementById('cancel-patch-btn')
    }
};

let allUsers = []; 

// --- 1. AUTH & SECURITY FIX ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (ALLOWED_ADMINS.includes(user.email)) {
            els.loginSection.classList.add('hidden');
            els.dashboard.classList.remove('hidden');
            initDashboard();
        } else {
            signOut(auth).then(() => {
                els.loginMsg.textContent = "Access Denied: You are not an authorized admin.";
                showToast("Unauthorized Account", "error");
            });
        }
    } else {
        els.loginSection.classList.remove('hidden');
        els.dashboard.classList.add('hidden');
    }
});

els.loginBtn.addEventListener('click', async () => {
    els.loginMsg.textContent = "Authenticating...";
    try {
        await signInWithEmailAndPassword(auth, els.email.value, els.pass.value);
    } catch (e) {
        els.loginMsg.textContent = "Access Denied: " + e.message;
    }
});

els.logoutBtn.addEventListener('click', () => signOut(auth));

// --- NAVIGATION ---
els.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        els.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        els.tabContents.forEach(content => {
            content.classList.add('hidden');
            if (content.id === `tab-${targetTab}`) {
                content.classList.remove('hidden');
            }
        });
    });
});

// --- DATA & LISTENERS ---
let allApps = [];

function initDashboard() {
    loadApps(); 
    loadRTDBStats();
    loadSiteConfig();
    loadPatchNotes();
    setupImportWipeHandlers();
    
    // --- 5. INITIALIZE ANNOUNCEMENT MANAGER ---
    initAdvancedAnnouncement(); 
}

// --- RTDB STATS ---
function loadRTDBStats() {
    const liveRef = dbRef(rtdb, "stats/live_visitors");
    const peakRef = dbRef(rtdb, "stats/peak_visitors");
    const downloadsRef = dbRef(rtdb, "stats/total_downloads");
    const visitsRef = dbRef(rtdb, "stats/total_visits");
    const connectedRef = dbRef(rtdb, ".info/connected");

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            els.stats.rtdbStatus.textContent = "Connected";
            els.stats.rtdbStatus.classList.remove('text-red-500');
            els.stats.rtdbStatus.classList.add('text-green-500');
            els.stats.rtdbLastUpdate.textContent = new Date().toLocaleTimeString();
        } else {
            els.stats.rtdbStatus.textContent = "Disconnected";
            els.stats.rtdbStatus.classList.remove('text-green-500');
            els.stats.rtdbStatus.classList.add('text-red-500');
        }
    });

    onValue(liveRef, (snap) => els.stats.liveVisitors.textContent = snap.val() || 0);
    onValue(peakRef, (snap) => els.stats.peakVisitors.textContent = snap.val() || 0);
    onValue(downloadsRef, (snap) => els.stats.downloads.textContent = (snap.val() || 0).toLocaleString());
    onValue(visitsRef, (snap) => els.stats.totalVisits.textContent = (snap.val() || 0).toLocaleString());

    els.resetPeakBtn.onclick = () => {
        showCustomPopup("Reset Peak", "Reset Peak Visitors?", "confirm", (confirmed) => {
            if (confirmed) {
                setRTDB(peakRef, els.stats.liveVisitors.textContent.replace(/,/g, ''));
                showToast("Peak Visitors Reset!", 'success');
            }
        });
    };
}

function loadSiteConfig() {
    const configRef = dbRef(rtdb, "site_config");
    onValue(configRef, (snap) => {
        const config = snap.val() || {};
        els.toggleSignups.checked = config.disableSignups || false;
        els.toggleMaintenance.checked = config.maintenanceMode || false;
        els.toggleSeo.checked = config.disableSeo || false;
        els.toggleCache.checked = config.forceCache || false;
    });
    
    const handleConfigChange = async () => {
        const payload = {
            disableSignups: els.toggleSignups.checked,
            maintenanceMode: els.toggleMaintenance.checked,
            disableSeo: els.toggleSeo.checked,
            forceCache: els.toggleCache.checked,
            lastModified: new Date().toISOString()
        };
        try {
            await updateRTDB(dbRef(rtdb, "site_config"), payload);
            els.configStatusMsg.textContent = "Settings saved successfully.";
            showToast("Config Updated", 'success');
        } catch(e) {
            els.configStatusMsg.textContent = "Error saving settings: " + e.message;
            showToast("Config Save Failed", 'error');
        }
    };

    els.toggleSignups.onchange = handleConfigChange;
    els.toggleMaintenance.onchange = handleConfigChange;
    els.toggleSeo.onchange = handleConfigChange;
    els.toggleCache.onchange = handleConfigChange;
}

// --- APP MANAGEMENT (Firestore) ---
function loadApps() {
    const q = query(collection(firestore, "apps"));
    onSnapshot(q, (snapshot) => {
        allApps = [];
        snapshot.forEach(doc => allApps.push({ _id: doc.id, ...doc.data() }));
        
        const outdatedApps = allApps.filter(app => {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const lastUpdatedDate = app.lastUpdated ? new Date(app.lastUpdated) : new Date(0);
            return lastUpdatedDate < sixMonthsAgo;
        });

        els.stats.appsNeedingUpdate.textContent = outdatedApps.length;
        allApps.sort((a, b) => (b.lastUpdated || "").localeCompare(a.lastUpdated || "")); 
        renderTable(allApps);
        els.stats.apps.textContent = allApps.length;
    });
}

function renderTable(apps) {
     els.tableBody.innerHTML = '';
    if (apps.length === 0) {
        els.tableBody.innerHTML = `<tr><td colspan="3" class="px-6 py-12 text-center text-gray-500">No apps found.</td></tr>`;
        return;
    }

    apps.forEach(app => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-800/50 transition border-b border-gray-800 last:border-0 group";
        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-white group-hover:gn-text transition">${app.name}</div>
                <div class="text-xs text-gray-600 font-mono">${app._id}</div>
            </td>
            <td class="px-6 py-4">
                <span class="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full border border-gray-700 uppercase font-bold tracking-wide">${app.category}</span>
            </td>
            <td class="px-6 py-4 text-right space-x-2">
                <button class="edit-btn bg-gray-800 hover:bg-blue-600 text-gray-400 hover:text-white w-8 h-8 rounded-md transition" data-id="${app._id}"><i class="fa-solid fa-pen"></i></button>
                <button class="view-btn bg-gray-800 hover:bg-green-600 text-gray-400 hover:text-white w-8 h-8 rounded-md transition" data-id="${app._id}"><i class="fa-solid fa-eye"></i></button>
                <button class="del-btn bg-gray-800 hover:bg-red-600 text-gray-400 hover:text-white w-8 h-8 rounded-md transition" data-id="${app._id}"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        els.tableBody.appendChild(tr);
    });

    document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', (e) => editApp(e.currentTarget.dataset.id)));
    document.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', (e) => deleteApp(e.currentTarget.dataset.id)));
    document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', (e) => window.open(`/pages/view.html?id=${e.currentTarget.dataset.id}`, '_blank')));
}

// --- APP EDIT LOGIC (FIXED) ---
function editApp(id) {
    const app = allApps.find(a => a._id === id);
    if (!app) return;
    
    // Populate simple fields
    els.inputs.docId.value = app._id; 
    els.inputs.id.value = app.id; 
    els.inputs.name.value = app.name;
    els.inputs.category.value = app.category; 
    els.inputs.version.value = app.version || '';
    els.inputs.tags.value = (app.tags || []).join(', '); 
    els.inputs.desc.value = app.description || '';
    els.inputs.link.value = app.downloadLink || ''; 
    els.inputs.image.value = app.image || '';
    
    // Populate Screenshots (Carousel)
    renderScreenshots(app.screenshots || []); 

    // UI Updates
    els.inputs.id.disabled = true; 
    els.saveBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Update App';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- GLOBAL SAVE LISTENER (FIXED) ---
els.saveBtn.addEventListener('click', async () => {
    const docId = els.inputs.docId.value || els.inputs.id.value;
    
    if(!docId) return showToast("App ID required", "error");
    if(!els.inputs.name.value) return showToast("App Name required", "error");

    // Gather Screenshots
    const screenshotsArr = Array.from(document.querySelectorAll('.screenshot-input'))
        .map(input => input.value.trim())
        .filter(val => val !== '');

    const payload = {
        id: els.inputs.id.value,
        name: els.inputs.name.value,
        category: els.inputs.category.value,
        version: els.inputs.version.value,
        tags: els.inputs.tags.value.split(',').map(s=>s.trim()),
        description: els.inputs.desc.value,
        downloadLink: els.inputs.link.value,
        image: els.inputs.image.value,
        screenshots: screenshotsArr, // Saved here
        lastUpdated: new Date().toISOString()
    };
    
    els.saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        await setDoc(doc(firestore, "apps", docId), payload, {merge: true});
        showToast("App Saved Successfully!", "success");
        clearForm();
    } catch(e) { 
        console.error(e);
        showToast("Error: " + e.message, 'error');
        els.saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save App';
    }
});

async function deleteApp(id) {
    showCustomPopup("Delete App", `Permanently delete ${id}?`, "confirm", async (confirmed) => {
        if (confirmed) {
            try {
                await deleteDoc(doc(firestore, "apps", id));
                showToast("App Deleted", 'success');
            } catch(e) { showToast(e.message, 'error'); }
        }
    });
}

function clearForm() {
    els.inputs.docId.value=''; 
    els.inputs.id.value=''; 
    els.inputs.id.disabled=false;
    els.inputs.name.value=''; 
    els.inputs.version.value=''; 
    els.inputs.tags.value='';
    els.inputs.desc.value=''; 
    els.inputs.link.value=''; 
    els.inputs.image.value='';
    
    // Clear Screenshots
    document.getElementById('app-screenshots-container').innerHTML = '';
    
    els.saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save App';
}

els.clearBtn.addEventListener('click', clearForm);

els.search.addEventListener('input', (e) => {
    const t = e.target.value.toLowerCase();
    renderTable(allApps.filter(a => a.name.toLowerCase().includes(t) || a._id.includes(t)));
});

// --- USER MANAGEMENT ---
els.searchUserBtn.addEventListener('click', executeUserSearch);

async function executeUserSearch() {
    const query = els.userSearchInput.value.trim();
    if (!query) return showToast("Enter User ID or Email", 'error');

    els.userResultCard.classList.add('hidden');
    els.userDownloadHistory.innerHTML = `<div class="loader mx-auto my-4"></div>`;
    els.userFavourites.innerHTML = `<div class="loader mx-auto my-4"></div>`;

    try {
        let userData = null;
        let uid = null;

        const isEmail = query.includes('@');

        if (!isEmail) {
            const userRef = dbRef(rtdb, `users/${query}`);
            let snapshot = await get(userRef);
            if (snapshot.exists()) {
                userData = snapshot.val();
                uid = query;
            }
        }

        if (!userData) {
            const allUsersRef = dbRef(rtdb, 'users');
            const allUsersSnapshot = await get(allUsersRef);
            
            if (allUsersSnapshot.exists()) {
                const allUsers = allUsersSnapshot.val();
                const searchEmail = query.toLowerCase().trim();
                
                for (const [userId, userInfo] of Object.entries(allUsers)) {
                    if (userInfo && userInfo.email) {
                        if (isEmail && userInfo.email.toLowerCase().trim() === searchEmail) {
                            userData = userInfo;
                            uid = userId;
                            break;
                        } else if (!isEmail && userId === query) {
                            userData = userInfo;
                            uid = userId;
                            break;
                        }
                    }
                }
            }
        }
        
        if (userData && uid) {
            els.userDisplayName.textContent = userData.name || userData.email.split('@')[0];
            els.userEmailId.textContent = userData.email;
            els.userResultCard.classList.remove('hidden');
            els.userDataWarning.classList.remove('hidden');
            
            populateUserDetailModal(uid, userData);
            await loadUserHistory(uid);
            await loadUserFavorites(uid);
            
            els.userDeleteBtn.onclick = () => deleteUserHistory(uid);
            els.userViewDetailsBtn.onclick = () => userDetailModal.style.display = 'flex'; 

        } else {
            els.userResultCard.classList.add('hidden');
            showToast("User not found in database", 'error');
        }
    } catch (e) {
        els.userResultCard.classList.add('hidden');
        showToast("Error searching user: " + e.message, 'error');
    }
}

function populateUserDetailModal(uid, userData) {
    document.getElementById('modal-user-uid').textContent = uid;
    document.getElementById('modal-user-name').textContent = userData.name || 'N/A';
    document.getElementById('modal-user-email').textContent = userData.email || 'N/A';
    document.getElementById('modal-user-join-date').textContent = userData.joined ? new Date(userData.joined).toLocaleDateString() : 'N/A';
    document.getElementById('modal-user-role').textContent = "User (Standard)";
    document.getElementById('modal-user-status').textContent = userData.banned ? 'Banned' : 'Active';
    
    document.getElementById('modal-revoke-btn').onclick = () => {
        showCustomPopup("Revoke Access", `Permanently ban ${userData.email}?`, "confirm", async (confirmed) => {
            if (confirmed) {
                await setRTDB(dbRef(rtdb, `users/${uid}/banned`), true);
                userDetailModal.style.display = 'none';
                showToast("User Access Revoked", "success");
                executeUserSearch(); 
            }
        });
    };
}

async function loadUserHistory(uid) {
    const historyRef = dbRef(rtdb, `users/${uid}/history`);
    const snapshot = await get(historyRef);
    const history = snapshot.val();
    
    if (!history) {
        els.userDownloadHistory.innerHTML = '<p class="text-gray-500 text-xs mt-2">No history.</p>';
        return;
    }
    
    let html = '';
    Object.keys(history).forEach(key => {
        const item = history[key];
        html += `
            <div class="data-card relative">
                <p class="text-white font-bold">${item.appName}</p>
                <p class="text-xs text-gray-500">${item.status} - ${item.installedDate || ''}</p>
                <button onclick="deleteUserItem('${uid}', 'history', '${key}')" class="absolute top-2 right-2 text-red-500 hover:text-white"><i class="fa-solid fa-times"></i></button>
            </div>
        `;
    });
    els.userDownloadHistory.innerHTML = html;
}

window.deleteUserItem = async (uid, list, key) => {
    if(confirm("Delete this item?")) {
        await setRTDB(dbRef(rtdb, `users/${uid}/${list}/${key}`), null);
        if(list==='history') loadUserHistory(uid);
    }
};

async function loadUserFavorites(uid) {
    const favRef = dbRef(rtdb, `users/${uid}/favorites`);
    const snapshot = await get(favRef);
    const favorites = snapshot.val();
    
    if (!favorites) {
        els.userFavourites.innerHTML = '<p class="text-gray-500 text-xs mt-2">No favorites yet.</p>';
        return;
    }
    
    let html = '';
    Object.keys(favorites).forEach(key => {
        const item = favorites[key];
        html += `
            <div class="bg-black/50 p-3 rounded border border-gray-700 mb-2">
                <p class="text-white font-bold text-sm">${item.name || key}</p>
                <p class="text-xs text-gray-500">${item.category || ''}</p>
            </div>
        `;
    });
    els.userFavourites.innerHTML = html;
}

async function deleteUserHistory(uid) { 
    showCustomPopup("Wipe Data", "Delete all user history and favorites?", "confirm", async (confirmed) => {
        if(confirmed) {
            await setRTDB(dbRef(rtdb, `users/${uid}/history`), null);
            await setRTDB(dbRef(rtdb, `users/${uid}/favorites`), null);
            showToast("User data wiped", "success");
            executeUserSearch();
        }
    });
}


// ======================================================
// --- 3. PATCH NOTES FEATURE ---
// ======================================================

function loadPatchNotes() {
    const q = query(collection(firestore, "patch_notes"), orderBy("releaseDate", "desc"));
    onSnapshot(q, (snapshot) => {
        els.patchTableBody.innerHTML = '';
        snapshot.forEach(doc => {
            const patch = doc.data();
            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-800/50 border-b border-gray-800";
            tr.innerHTML = `
                <td class="px-6 py-4 text-white font-bold">${patch.version}</td>
                <td class="px-6 py-4 text-gray-400">${patch.releaseDate}</td>
                <td class="px-6 py-4"><span class="bg-gray-800 px-2 py-1 rounded text-xs border" style="border-color:${patch.borderColor || '#333'}">${patch.mainCategory}</span></td>
                <td class="px-6 py-4 text-right space-x-2">
                    <button class="edit-patch-btn bg-blue-900/30 text-blue-400 p-2 rounded hover:bg-blue-600 hover:text-white transition" data-id="${doc.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="del-patch-btn bg-red-900/30 text-red-400 p-2 rounded hover:bg-red-600 hover:text-white transition" data-id="${doc.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            els.patchTableBody.appendChild(tr);
        });

        document.querySelectorAll('.edit-patch-btn').forEach(b => b.onclick = () => openPatchEditor(b.dataset.id));
        document.querySelectorAll('.del-patch-btn').forEach(b => b.onclick = () => deletePatch(b.dataset.id));
    });
}

// Editor State
let currentPatchBlocks = [];

els.btnNewPatch.onclick = () => {
    resetPatchEditor();
    els.patchListSection.classList.add('hidden');
    els.patchEditorSection.classList.remove('hidden');
};

els.patchForm.cancelBtn.onclick = () => {
    els.patchEditorSection.classList.add('hidden');
    els.patchListSection.classList.remove('hidden');
};

// Block Builders
function createBlockUI(block, index) {
    const div = document.createElement('div');
    div.className = "bg-gray-900 border border-gray-700 p-4 rounded-lg mb-4 relative group";
    div.dataset.index = index;
    
    // Header (Type + Delete)
    const header = document.createElement('div');
    header.className = "flex justify-between mb-2 text-xs uppercase font-bold text-gray-500";
    header.innerHTML = `<span>${block.type}</span> <button class="text-red-500 hover:text-white" onclick="removePatchBlock(${index})"><i class="fa-solid fa-times"></i></button>`;
    div.appendChild(header);

    // Inputs based on Type
    if (block.type === 'heading' || block.type === 'subheading') {
        div.innerHTML += `
            <input type="text" class="w-full bg-black border border-gray-700 rounded p-2 mb-2 text-white" placeholder="Heading Text" value="${block.content}" onchange="updateBlock(${index}, 'content', this.value)">
            <input type="text" class="w-full bg-black border border-gray-700 rounded p-2 text-sm text-gray-300" placeholder="Icon Class (fa-solid fa-star)" value="${block.icon || ''}" onchange="updateBlock(${index}, 'icon', this.value)">
        `;
    } else if (block.type === 'paragraph' || block.type === 'list-item') {
        div.innerHTML += `
            <textarea class="w-full bg-black border border-gray-700 rounded p-2 text-white h-20" placeholder="Content..." onchange="updateBlock(${index}, 'content', this.value)">${block.content}</textarea>
        `;
    } else if (block.type === 'image' || block.type === 'video') {
         div.innerHTML += `
            <input type="text" class="w-full bg-black border border-gray-700 rounded p-2 mb-2 text-green-400" placeholder="Image/Video URL" value="${block.url || ''}" onchange="updateBlock(${index}, 'url', this.value)">
            <input type="text" class="w-full bg-black border border-gray-700 rounded p-2 text-sm text-gray-300" placeholder="Caption/Alt Text" value="${block.content || ''}" onchange="updateBlock(${index}, 'content', this.value)">
        `;
    } else if (block.type === 'sub-box') {
        div.innerHTML += `
            <div class="border-l-4 border-purple-500 pl-4">
                <input type="text" class="w-full bg-black border border-gray-700 rounded p-2 mb-2 text-white" placeholder="Box Title" value="${block.title || ''}" onchange="updateBlock(${index}, 'title', this.value)">
                <textarea class="w-full bg-black border border-gray-700 rounded p-2 text-white h-16" placeholder="Box Content..." onchange="updateBlock(${index}, 'content', this.value)">${block.content}</textarea>
            </div>
        `;
    }

    return div;
}

function renderBlocks() {
    const container = els.patchForm.blocksContainer;
    container.innerHTML = '';
    currentPatchBlocks.forEach((block, idx) => {
        container.appendChild(createBlockUI(block, idx));
    });
}

// Global functions for inline HTML calls
window.removePatchBlock = (index) => {
    currentPatchBlocks.splice(index, 1);
    renderBlocks();
};
window.updateBlock = (index, field, value) => {
    currentPatchBlocks[index][field] = value;
};

// Add Block Handlers
els.patchForm.addHeadingBtn.onclick = () => { currentPatchBlocks.push({ type: 'heading', content: '', icon: '' }); renderBlocks(); };
els.patchForm.addParaBtn.onclick = () => { currentPatchBlocks.push({ type: 'paragraph', content: '' }); renderBlocks(); };
els.patchForm.addImageBtn.onclick = () => { currentPatchBlocks.push({ type: 'image', url: '', content: '' }); renderBlocks(); };
els.patchForm.addSubBoxBtn.onclick = () => { currentPatchBlocks.push({ type: 'sub-box', title: '', content: '' }); renderBlocks(); };
els.patchForm.addListBtn.onclick = () => { currentPatchBlocks.push({ type: 'list-item', content: '' }); renderBlocks(); };


// SAVE PATCH
els.patchForm.saveBtn.onclick = async () => {
    const version = els.patchForm.version.value;
    if(!version) return showToast("Version required", "error");

    const payload = {
        version: version,
        releaseDate: els.patchForm.date.value,
        mainCategory: els.patchForm.category.value,
        borderColor: els.patchForm.borderColor.value,
        notes: currentPatchBlocks
    };
    
    const docId = els.patchForm.docId.value || `v-${version.replace(/\./g, '-')}`;

    try {
        await setDoc(doc(firestore, "patch_notes", docId), payload);
        showToast("Patch Note Published!", "success");
        els.patchEditorSection.classList.add('hidden');
        els.patchListSection.classList.remove('hidden');
    } catch(e) {
        showToast("Save Failed: " + e.message, 'error');
    }
};

async function openPatchEditor(id) {
    const docSnap = await getDocFS(doc(firestore, "patch_notes", id));
    if(!docSnap.exists()) return;
    const data = docSnap.data();
    
    els.patchForm.docId.value = id;
    els.patchForm.version.value = data.version;
    els.patchForm.date.value = data.releaseDate;
    els.patchForm.category.value = data.mainCategory;
    els.patchForm.borderColor.value = data.borderColor || '#9F00FF';
    
    currentPatchBlocks = data.notes || [];
    renderBlocks();
    els.patchListSection.classList.add('hidden');
    els.patchEditorSection.classList.remove('hidden');
}

function resetPatchEditor() {
    els.patchForm.docId.value = '';
    els.patchForm.version.value = '';
    els.patchForm.date.value = new Date().toISOString().split('T')[0];
    els.patchForm.category.value = 'Update';
    els.patchForm.borderColor.value = '#9F00FF';
    currentPatchBlocks = [];
    renderBlocks();
}

async function deletePatch(id) {
    if(confirm("Delete this patch note?")) {
        await deleteDoc(doc(firestore, "patch_notes", id));
        showToast("Patch Deleted", "success");
    }
}

// --- APP SCREENSHOTS / CAROUSEL ---
function renderScreenshots(list = []) {
    const container = document.getElementById('app-screenshots-container');
    container.innerHTML = '';
    
    if(!list || list.length === 0) return;

    list.forEach(url => addScreenshotRow(url));
}

function addScreenshotRow(value = '') {
    const container = document.getElementById('app-screenshots-container');
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center';
    
    row.innerHTML = `
        <div class="relative flex-grow">
            <input type="text" class="screenshot-input w-full bg-black border border-gray-700 rounded p-2 text-xs text-gray-300 focus:border-purple-500 outline-none pr-8" placeholder="Image Link or Upload ->" value="${value}">
            <label class="absolute right-2 top-1.5 cursor-pointer text-gray-500 hover:text-blue-400" title="Upload Image">
                <i class="fa-solid fa-upload"></i>
                <input type="file" class="hidden screenshot-file-upload" accept="image/*">
            </label>
        </div>
        <button class="bg-red-900/30 text-red-500 hover:text-white hover:bg-red-600 w-8 h-8 rounded flex items-center justify-center transition" onclick="this.parentElement.remove()">
            <i class="fa-solid fa-times"></i>
        </button>
    `;

    container.appendChild(row);

    const fileInput = row.querySelector('.screenshot-file-upload');
    const textInput = row.querySelector('.screenshot-input');

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                textInput.value = evt.target.result; 
                textInput.style.borderColor = '#4ade80';
                setTimeout(() => textInput.style.borderColor = '', 500);
            };
            reader.readAsDataURL(file);
        }
    });
}

document.getElementById('add-screenshot-btn').addEventListener('click', (e) => {
    e.preventDefault(); 
    addScreenshotRow();
});

// Import & Wipe Handlers
function setupImportWipeHandlers() {
    // Show Import Modal
    els.importToggleBtn.addEventListener('click', () => {
        els.importSection.style.display = 'flex';
    });

    // Hide Import Modal
    els.cancelImportBtn.addEventListener('click', () => {
        els.importSection.style.display = 'none';
        els.importJsonData.value = '';
        els.importStatus.textContent = '';
    });

    // Import File Upload
    els.importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                els.importJsonData.value = evt.target.result;
            };
            reader.readAsText(file);
        }
    });

    // Run Import
    els.runImportBtn.addEventListener('click', async () => {
        const jsonText = els.importJsonData.value.trim();
        if (!jsonText) return showToast("No JSON data provided", "error");
        
        try {
            const apps = JSON.parse(jsonText);
            if (!Array.isArray(apps)) throw new Error("JSON must be an array");
            
            els.importStatus.textContent = "Importing...";
            els.importStatus.style.color = "#fbbf24";
            
            let count = 0;
            for (const app of apps) {
                const docId = app.id || app._id;
                if (!docId) continue;
                await setDoc(doc(firestore, "apps", docId), app, { merge: true });
                count++;
            }
            
            els.importStatus.textContent = `✓ Imported ${count} apps successfully`;
            els.importStatus.style.color = "#10b981";
            showToast(`${count} Apps Imported`, "success");
            
            setTimeout(() => {
                els.importSection.style.display = 'none';
                els.importJsonData.value = '';
                els.importStatus.textContent = '';
                els.importFileInput.value = '';
            }, 2000);
        } catch (e) {
            els.importStatus.textContent = "✗ Error: " + e.message;
            els.importStatus.style.color = "#ef4444";
            showToast("Import Failed", "error");
        }
    });

    // Wipe All Apps
    els.deleteAllBtn.addEventListener('click', () => {
        showCustomPopup(
            "⚠️ DANGER ZONE", 
            `This will permanently delete ALL ${allApps.length} apps from the database. Type 'DELETE' to confirm.`, 
            "prompt", 
            async (input) => {
                if (input === "DELETE") {
                    try {
                        const batch = writeBatch(firestore);
                        allApps.forEach(app => {
                            batch.delete(doc(firestore, "apps", app._id));
                        });
                        await batch.commit();
                        showToast("All Apps Deleted", "success");
                    } catch(e) {
                        showToast("Delete Failed: " + e.message, "error");
                    }
                } else if (input) {
                    showToast("Incorrect confirmation code", "error");
                }
            }
        );
    });
}

// ======================================================
// --- 4. ADVANCED ANNOUNCEMENT MANAGER (FIXED) ---
// ======================================================

let currentAnnounceBlocks = [];

function initAdvancedAnnouncement() {
    const announceRef = dbRef(rtdb, "site_config/announcement");

    // UI Elements
    const container = document.getElementById('announce-blocks-container');
    const emptyMsg = document.getElementById('announce-empty-msg');
    const enabledCheck = document.getElementById('announce-enabled');
    const freqSelect = document.getElementById('announce-freq');
    const pageChecks = document.querySelectorAll('.announce-page-check');

    // 1. Load Data
    onValue(announceRef, (snap) => {
        const data = snap.val() || {};
        
        enabledCheck.checked = data.enabled || false;
        freqSelect.value = data.frequency || 'once';
        
        // Pages (If empty array, uncheck all, but visually user sees nothing checked)
        const activePages = data.pages || [];
        pageChecks.forEach(cb => cb.checked = activePages.includes(cb.value));

        // Content
        currentAnnounceBlocks = data.content || [];
        renderAnnounceBlocks();
    });

    // 2. Render Functions
    function renderAnnounceBlocks() {
        container.innerHTML = '';
        if (currentAnnounceBlocks.length === 0) {
            container.appendChild(emptyMsg);
            emptyMsg.style.display = 'flex';
        } else {
            emptyMsg.style.display = 'none';
            currentAnnounceBlocks.forEach((block, idx) => {
                container.appendChild(createAnnounceBlockUI(block, idx));
            });
        }
    }

    function createAnnounceBlockUI(block, index) {
        const div = document.createElement('div');
        div.className = "bg-gray-900 border border-gray-700 p-3 rounded-lg relative group transition hover:border-purple-500";
        
        let innerHTML = `<div class="flex justify-between mb-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
            <span>${block.type}</span> 
            <div class="flex gap-2">
                <button class="text-gray-500 hover:text-white" onclick="moveAnnounceBlock(${index}, -1)"><i class="fa-solid fa-arrow-up"></i></button>
                <button class="text-gray-500 hover:text-white" onclick="moveAnnounceBlock(${index}, 1)"><i class="fa-solid fa-arrow-down"></i></button>
                <button class="text-red-500 hover:text-white" onclick="removeAnnounceBlock(${index})"><i class="fa-solid fa-times"></i></button>
            </div>
        </div>`;

        if (block.type === 'heading') {
            innerHTML += `
                <input type="text" class="w-full bg-black border border-gray-700 rounded p-2 mb-2 text-white font-bold" placeholder="Heading Text" value="${block.content}" onchange="updateAnnounceBlock(${index}, 'content', this.value)">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500">Color:</span>
                    <input type="color" class="bg-transparent border-0 h-6 w-8 cursor-pointer" value="${block.color || '#ffffff'}" onchange="updateAnnounceBlock(${index}, 'color', this.value)">
                </div>
            `;
        } else if (block.type === 'paragraph' || block.type === 'list-item') {
            innerHTML += `<textarea class="w-full bg-black border border-gray-700 rounded p-2 text-sm text-gray-300 h-16" placeholder="Content..." onchange="updateAnnounceBlock(${index}, 'content', this.value)">${block.content}</textarea>`;
        } else if (block.type === 'image') {
            innerHTML += `<input type="text" class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-green-400 font-mono" placeholder="Image URL" value="${block.url || ''}" onchange="updateAnnounceBlock(${index}, 'url', this.value)">`;
        } else if (block.type === 'button') {
            innerHTML += `
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <input type="text" class="bg-black border border-gray-700 rounded p-2 text-sm text-white" placeholder="Button Label" value="${block.text || ''}" onchange="updateAnnounceBlock(${index}, 'text', this.value)">
                    <input type="color" class="h-full w-full bg-black border border-gray-700 rounded cursor-pointer" value="${block.color || '#9F00FF'}" onchange="updateAnnounceBlock(${index}, 'color', this.value)">
                </div>
                <input type="text" class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-blue-400 font-mono" placeholder="Link URL (/pages/...)" value="${block.link || ''}" onchange="updateAnnounceBlock(${index}, 'link', this.value)">
            `;
        }

        div.innerHTML += innerHTML;
        return div;
    }

    // 3. Add Block Listeners
    document.getElementById('ann-add-heading').onclick = () => { currentAnnounceBlocks.push({type:'heading', content:'', color:'#ffffff'}); renderAnnounceBlocks(); };
    document.getElementById('ann-add-text').onclick = () => { currentAnnounceBlocks.push({type:'paragraph', content:''}); renderAnnounceBlocks(); };
    document.getElementById('ann-add-list').onclick = () => { currentAnnounceBlocks.push({type:'list-item', content:''}); renderAnnounceBlocks(); };
    document.getElementById('ann-add-image').onclick = () => { currentAnnounceBlocks.push({type:'image', url:''}); renderAnnounceBlocks(); };
    document.getElementById('ann-add-btn').onclick = () => { currentAnnounceBlocks.push({type:'button', text:'Click Me', link:'#', color:'#9F00FF'}); renderAnnounceBlocks(); };

    // 4. Global Helpers (for inline HTML onclicks)
    window.removeAnnounceBlock = (idx) => { currentAnnounceBlocks.splice(idx, 1); renderAnnounceBlocks(); };
    window.updateAnnounceBlock = (idx, field, val) => { currentAnnounceBlocks[idx][field] = val; };
    window.moveAnnounceBlock = (idx, dir) => {
        if ((dir === -1 && idx > 0) || (dir === 1 && idx < currentAnnounceBlocks.length - 1)) {
            const temp = currentAnnounceBlocks[idx];
            currentAnnounceBlocks[idx] = currentAnnounceBlocks[idx + dir];
            currentAnnounceBlocks[idx + dir] = temp;
            renderAnnounceBlocks();
        }
    };

    // 5. Save Handler
    document.getElementById('save-announce-btn').addEventListener('click', async () => {
        const pages = [];
        pageChecks.forEach(cb => { if(cb.checked) pages.push(cb.value); });
        
        // IMPORTANT: If pages array is empty, it means ALL PAGES are targeted.
        // We save exactly what the user selected. The client script (announcement.js)
        // handles [] as "Show Everywhere".

        try {
            await updateRTDB(announceRef, {
                enabled: enabledCheck.checked,
                frequency: freqSelect.value,
                pages: pages, // Save the array (empty or populated)
                content: currentAnnounceBlocks,
                lastUpdated: Date.now() // Forces popup to show again if it's new
            });
            showToast("Announcement Published!", "success");
        } catch (e) {
            showToast(e.message, "error");
        }
    });
}