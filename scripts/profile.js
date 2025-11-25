import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, onValue, update as updateDB } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

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

// Safe Init
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

const els = {
    name: document.getElementById('u-name'),
    user: document.getElementById('u-username'),
    email: document.getElementById('u-email'),
    phone: document.getElementById('u-phone'),
    avatar: document.getElementById('u-avatar'),
    history: document.getElementById('history-list'),
    favs: document.getElementById('fav-list'),
    wrapper: document.getElementById('pic-wrapper'),
    fileInput: document.getElementById('file-input'),
    logoutBtn: document.getElementById('btn-logout')
};

const showToast = (msg) => {
    const t = document.getElementById('toast');
    if(t) { t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
};

// 1. LOGOUT LOGIC
if(els.logoutBtn) {
    els.logoutBtn.addEventListener('click', () => {
        if(confirm("Are you sure you want to logout?")) {
            signOut(auth).then(() => {
                showToast("Logged out successfully!");
                window.location.replace('/pages/login.html');
            }).catch((error) => {
                showToast("Error logging out: " + error.message);
            });
        }
    });
}

// 2. UPLOAD LOGIC
if(els.wrapper && els.fileInput) {
    els.wrapper.addEventListener('click', () => els.fileInput.click());
    
    els.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const user = auth.currentUser;
        
        if (!file || !user) return;
        
        els.wrapper.classList.add('uploading');
        showToast("Uploading...");
        
        try {
            const picRef = storageRef(storage, 'profile_pics/' + user.uid);
            await uploadBytes(picRef, file);
            const url = await getDownloadURL(picRef);
            await updateProfile(user, { photoURL: url });
            await updateDB(ref(db, 'users/' + user.uid), { photoURL: url });
            
            const cacheBuster = "?t=" + new Date().getTime();
            els.avatar.src = url + cacheBuster;
            
            showToast("Profile picture updated!");
        } catch (err) {
            console.error(err);
            showToast("Failed: " + err.message);
        } finally {
            els.wrapper.classList.remove('uploading');
        }
    });
}

// 3. AUTH LISTENER & REDIRECT CHECK
onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) {
        // --- LOGGED IN ---
        if(els.name) els.name.textContent = user.displayName || "User";
        if(els.email) els.email.textContent = user.email;
        if(els.avatar && user.photoURL) {
            const separator = user.photoURL.includes('?') ? '&' : '?';
            els.avatar.src = user.photoURL + separator + "v=" + Math.random(); 
        }

        const userRef = ref(db, 'users/' + user.uid);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val() || {};
            if(els.phone) els.phone.textContent = data.phone || user.phoneNumber || "Not Set";
            if(els.user) els.user.textContent = data.username ? `@${data.username}` : (user.displayName ? `@${user.displayName}` : "@user");
            if(els.avatar && data.photoURL) {
                 const separator = data.photoURL.includes('?') ? '&' : '?';
                 els.avatar.src = data.photoURL + separator + "db=" + Math.random(); 
            }
            
            console.log("Profile Data Loaded:", data); // DEBUG LOG
            
            renderList(data.history || {}, els.history, 'download');
            renderList(data.favorites || {}, els.favs, 'heart');
        });
    } else {
        // --- REDIRECT IF NOT LOGGED IN ---
        window.location.replace("/pages/login.html");
    }
});

function renderList(dataObj, container, type) {
    if(!container) return;
    const items = Object.values(dataObj);
    
    if (items.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid ${type === 'download' ? 'fa-ghost' : 'fa-heart-crack'}"></i><p>No items.</p></div>`;
        return;
    }
    
    container.innerHTML = '';
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    items.forEach(item => {
        const icon = item.icon || 'https://cdn-icons-png.flaticon.com/512/3616/3616929.png';
        const name = item.appName || item.name || 'App';
        const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '';
        
        // Get correct status label
        let statusLabel = "Installed";
        let badgeColor = "#9F00FF"; // Purple default

        if (type === 'download') {
            const status = item.status ? item.status.toLowerCase() : 'installed';
            
            if (status.includes('downloading')) {
                statusLabel = "Downloading";
                badgeColor = "#ff9800"; // Orange
            } else if (status === 'installed') {
                statusLabel = "Installed";
                badgeColor = "#00e676"; // Green
            } else {
                statusLabel = item.status; // Custom or other status
            }
        } else {
            statusLabel = "Liked";
            badgeColor = "#ff4081"; // Pink
        }

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <img src="${icon}" class="item-icon" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3616/3616929.png'">
            <div class="item-info">
                <h4>${name}</h4>
                <p>${date}</p>
            </div>
            <span class="status-badge" style="background:${badgeColor}">${statusLabel}</span>
        `;
        container.appendChild(div);
    });
}