 import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
    import { getAuth, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
    import { getDatabase, ref, onValue, update as updateDB } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
    import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

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

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getDatabase(app);
    const storage = getStorage(app);

    // DOM Elements
    const els = {
        name: document.getElementById('u-name'),
        user: document.getElementById('u-username'),
        email: document.getElementById('u-email'),
        phone: document.getElementById('u-phone'),
        avatar: document.getElementById('u-avatar'),
        history: document.getElementById('history-list'),
        favs: document.getElementById('fav-list'),
        wrapper: document.getElementById('pic-wrapper'),
        fileInput: document.getElementById('file-input')
    };

    // Helper: Show Toast
    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
    }

    // 1. HANDLE PROFILE PIC UPLOAD
    els.wrapper.addEventListener('click', () => els.fileInput.click());

    els.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const user = auth.currentUser;
        
        if (!file || !user) return;

        // UI Loading
        els.wrapper.classList.add('uploading');
        showToast("Uploading image...");

        try {
            // Upload to Firebase Storage
            const picRef = storageRef(storage, 'profile_pics/' + user.uid);
            await uploadBytes(picRef, file);
            const photoURL = await getDownloadURL(picRef);

            // Update Auth Profile
            await updateProfile(user, { photoURL: photoURL });

            // Update Realtime DB
            await updateDB(ref(db, 'users/' + user.uid), {
                photoURL: photoURL // Sync with DB so it persists
            });

            // Update UI Immediately
            els.avatar.src = photoURL;
            showToast("Profile picture updated!");

        } catch (error) {
            console.error("Upload failed", error);
            showToast("Error uploading image: " + error.message);
        } finally {
            els.wrapper.classList.remove('uploading');
        }
    });


    // 2. AUTH & DATA FETCHING
    let dataLoaded = false;

    onAuthStateChanged(auth, (user) => {
        dataLoaded = true; // Got a response from Firebase

        if (user) {
            // Basic Auth Info
            els.name.textContent = user.displayName || "User";
            els.email.textContent = user.email;
            if(user.photoURL) els.avatar.src = user.photoURL;

            // Fetch DB Data
            const userRef = ref(db, 'users/' + user.uid);
            
            onValue(userRef, (snapshot) => {
                const data = snapshot.val() || {};

                // Fill Details
                els.phone.textContent = data.phone || user.phoneNumber || "Not Linked";
                els.user.textContent = data.username ? `@${data.username}` : (user.displayName ? `@${user.displayName.replace(/\s/g,'').toLowerCase()}` : "@user");
                if(data.photoURL) els.avatar.src = data.photoURL; // DB takes precedence if set

                // Render Lists
                renderList(data.history || {}, els.history, 'download');
                renderList(data.favorites || {}, els.favs, 'heart');
            });

        } else {
            // User is NOT Logged In
            els.name.textContent = "Guest";
            els.email.textContent = "-";
            els.phone.textContent = "-";
            els.history.innerHTML = `<div class="empty-state"><p>Please <a href="/pages/login.html" style="color:#9F00FF">Login</a></p></div>`;
            els.favs.innerHTML = `<div class="empty-state"><p>Please <a href="/pages/login.html" style="color:#9F00FF">Login</a></p></div>`;
        }
    });

    // 3. SAFETY TIMEOUT (If loading gets stuck)
    setTimeout(() => {
        if (!dataLoaded) {
            if (!auth.currentUser) {
                els.name.textContent = "Connection Slow";
                els.history.innerHTML = `<div class="empty-state"><p>Checking connection...</p></div>`;
            }
        }
    }, 5000);

    // Helper: Render Lists
    function renderList(dataObj, container, type) {
        const items = Object.values(dataObj);
        
        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid ${type === 'download' ? 'fa-ghost' : 'fa-heart-crack'}"></i>
                    <p>No items yet.</p>
                </div>`;
            return;
        }

        container.innerHTML = ''; 
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        items.forEach(item => {
            const icon = item.icon || 'https://cdn-icons-png.flaticon.com/512/3616/3616929.png';
            const name = item.appName || item.name || 'App';
            const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '';

            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <img src="${icon}" class="item-icon" alt="App">
                <div class="item-info">
                    <h4>${name}</h4>
                    <p>${date}</p>
                </div>
                <span class="status-badge">${type === 'download' ? 'Installed' : 'Liked'}</span>
            `;
            container.appendChild(div);
        });
    }