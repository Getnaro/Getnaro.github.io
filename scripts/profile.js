/**
 * PROFILE PAGE
 * /scripts/profile.js
 */

import { mainAuth, mainDb, mainStorage } from './firebase-config.js';
import { onAuthStateChanged, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { ref, onValue, update as updateDB } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

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
    if(t) { 
        t.textContent = msg; 
        t.style.display = 'block'; 
        setTimeout(() => t.style.display = 'none', 3000); 
    }
};

if(els.logoutBtn) {
    els.logoutBtn.addEventListener('click', () => {
        if(confirm("Are you sure you want to logout?")) {
            signOut(mainAuth).then(() => {
                showToast("Logged out successfully!");
                sessionStorage.clear();
                setTimeout(() => {
                    window.location.replace('/pages/login.html');
                }, 500);
            }).catch((error) => {
                console.error("Logout error:", error);
                showToast("Logout failed. Please try again.");
            });
        }
    });
}

if(els.wrapper && els.fileInput) {
    els.wrapper.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const user = mainAuth.currentUser;
        if (!file || !user) return;
        els.wrapper.classList.add('uploading');
        try {
            const picRef = storageRef(mainStorage, 'profile_pics/' + user.uid);
            await uploadBytes(picRef, file);
            const url = await getDownloadURL(picRef);
            await updateProfile(user, { photoURL: url });
            await updateDB(ref(mainDb, 'users/' + user.uid), { photoURL: url });
            els.avatar.src = url + "?t=" + new Date().getTime();
            showToast("Profile picture updated!");
        } catch (err) { 
            showToast("Failed: " + err.message); 
        }
        finally { 
            els.wrapper.classList.remove('uploading'); 
        }
    });
}

if(els.name) els.name.textContent = "Loading...";
if(els.email) els.email.textContent = "Loading...";

onAuthStateChanged(mainAuth, (user) => {
    console.log("Profile Auth:", user ? user.email : "Not logged in");
    
    if (user && !user.isAnonymous) {
        if(els.name) els.name.textContent = user.displayName || "User";
        if(els.email) els.email.textContent = user.email;
        if(els.avatar && user.photoURL) els.avatar.src = user.photoURL;

        const userRef = ref(mainDb, 'users/' + user.uid);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val() || {};
            if(els.phone) els.phone.textContent = data.phone || user.phoneNumber || "Not Linked";
            if(els.user) els.user.textContent = data.username ? `@${data.username}` : "@user";
            if(els.avatar && data.photoURL) els.avatar.src = data.photoURL;
            
            renderList(data.history || {}, els.history, 'download');
            renderList(data.favorites || {}, els.favs, 'heart');
        });
    } else {
        console.log("Redirecting to login...");
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
        
        let statusLabel = "Installed";
        let badgeColor = "#00e676";

        if (type === 'download') {
            const status = item.status ? item.status.toLowerCase() : 'installed';
            if (status.includes('downloading')) {
                statusLabel = "Downloading"; 
                badgeColor = "#ff9800";
            } else if (status === 'installed') {
                statusLabel = "Installed";
                badgeColor = "#00e676";
            } else if (status === 'uninstalled') {
                 statusLabel = "Uninstalled";
                 badgeColor = "#d32f2f";
            } else {
                statusLabel = item.status;
                badgeColor = "#aaa";
            }
        } else {
            statusLabel = "Liked";
            badgeColor = "#ff4081";
        }

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <img src="${icon}" class="item-icon" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3616/3616929.png'">
            <div class="item-info"><h4>${name}</h4><p>${date}</p></div>
            <span class="status-badge" style="background:${badgeColor}">${statusLabel}</span>
        `;
        container.appendChild(div);
    });
}