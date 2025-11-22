import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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

document.addEventListener("DOMContentLoaded", () => {
    const appCard = document.querySelector('.content-one');
    if (!appCard) return;

    const appId = appCard.dataset.app;
    // Get exact App Name for Registry Search (Use h1 text)
    const appName = appCard.querySelector('h1') ? appCard.querySelector('h1').textContent.trim() : "Unknown App";
    const appIcon = appCard.querySelector('.gn-card-left img') ? appCard.querySelector('.gn-card-left img').src : "";
    
    const btnDownload = appCard.querySelector('.gn-btn-download');
    const btnUpdate = appCard.querySelector('.gn-btn-update');
    const btnUninstall = appCard.querySelector('.gn-btn-uninstall');
    const statusText = appCard.querySelector('[id^="install-status"]');

    // --- LISTEN FOR USER AUTH ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const appRef = ref(db, `users/${user.uid}/history/${appId}`);

            // A. CHECK FIREBASE HISTORY
            onValue(appRef, async (snapshot) => {
                let isTrulyInstalled = false;

                // B. CHECK WINDOWS REGISTRY (If Electron API is available)
                if (window.appAPI && window.appAPI.checkInstalled) {
                    console.log("Checking Registry for:", appName);
                    isTrulyInstalled = await window.appAPI.checkInstalled(appName);
                } else {
                    // Fallback for web-only users: Trust Firebase
                    isTrulyInstalled = snapshot.exists();
                }

                if (isTrulyInstalled) {
                    // APP IS INSTALLED ON DEVICE
                    const data = snapshot.val() || { timestamp: Date.now() };
                    showInstalledState(data.timestamp);
                } else {
                    // APP IS MISSING (Even if Firebase says downloaded)
                    showNotInstalledState();
                }
            });

            // C. HANDLE DOWNLOAD CLICK
            if (btnDownload) {
                btnDownload.onclick = (e) => {
                    saveToHistory(user.uid, appId, appName, appIcon);
                };
            }

            // D. HANDLE UNINSTALL CLICK (Integration with Windows)
            if (btnUninstall) {
                btnUninstall.onclick = (e) => {
                    e.preventDefault();
                    if (window.appAPI && window.appAPI.openUninstallSettings) {
                        window.appAPI.openUninstallSettings();
                    } else {
                        alert("Please use Windows Settings to uninstall this app.");
                    }
                };
            }

        } else {
            showNotInstalledState();
            if (btnDownload) {
                btnDownload.onclick = (e) => {
                    e.preventDefault();
                    alert("Please login to download and track apps.");
                    window.location.href = "/pages/login.html";
                };
            }
        }
    });

    // --- HELPER FUNCTIONS ---

    function saveToHistory(uid, id, name, icon) {
        const timestamp = Date.now();
        const dateString = new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        set(ref(db, `users/${uid}/history/${id}`), {
            appName: name, appId: id, icon: icon,
            timestamp: timestamp, installedDate: dateString, status: 'installed'
        });
    }

    function showInstalledState(timestamp) {
        if (btnDownload) btnDownload.style.display = "none";
        if (btnUpdate) btnUpdate.style.display = "inline-flex"; 
        if (btnUninstall) btnUninstall.style.display = "inline-flex";

        if (statusText) {
            const date = new Date(timestamp).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
            statusText.innerHTML = `<span style="color:#00e676; font-weight:bold;">Installed on Device</span>`;
        }
    }

    function showNotInstalledState() {
        if (btnDownload) btnDownload.style.display = "inline-flex";
        if (btnUpdate) btnUpdate.style.display = "none";
        if (btnUninstall) btnUninstall.style.display = "none";
        
        if (statusText) statusText.innerHTML = "Not Installed";
    }
});