import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- 1. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBwBvhi2FDUJEoOHWic-2Ka8nRWyj_7uzo",
  authDomain: "stat-getnaroapp.firebaseapp.com",
  databaseURL: "https://stat-getnaroapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "stat-getnaroapp",
  storageBucket: "stat-getnaroapp.firebasestorage.app",
  messagingSenderId: "129355115034",
  appId: "1:129355115034:web:21c3c36ccb940d7fab7fa3"
};

const DOWNLOAD_LINKS = {
    x64: "https://getnaro.github.io/getnaro/x64",
    x32: "https://getnaro.github.io/getnaro/x32",
    minimal: "https://getnaro.github.io/getnaro/minimal",
    portable: "https://getnaro.github.io/getnaro/portable"
};


// --- 2. INIT FIREBASE ---
const app = initializeApp(firebaseConfig, "stats-project");
const db = getFirestore(app);
const auth = getAuth(app);
let firebaseOnline = false;

// --- 3. UI REFERENCES ---
const getUI = () => ({
    downloadBtn: document.getElementById('download-btn'),
    downloadCount: document.getElementById('download-count'),
    ratingValue: document.getElementById('rating-value'),
    totalRatings: document.getElementById('total-ratings'),
    starsContainer: document.getElementById('stars-container'),
    ratingArea: document.querySelector('.gn-rating-area')
});

// --- 4. CORE FUNCTIONS ---

function renderStars(ratingValue) {
    const { starsContainer } = getUI();
    if (!starsContainer) return;
    starsContainer.innerHTML = ''; 
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('i');
        star.className = 'fa-solid fa-star';
        if (i <= ratingValue) {
            star.style.color = '#FFD700'; 
            star.style.opacity = '1';
        } else {
            star.style.color = '#888'; 
            star.style.opacity = '0.3';
        }
        starsContainer.appendChild(star);
    }
}

function initInteractiveRating() {
    const { starsContainer } = getUI();
    if (!starsContainer) return;

    if (localStorage.getItem('getnaro_rated')) {
        starsContainer.style.pointerEvents = 'none';
        return;
    }

    starsContainer.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('i');
        star.className = 'fa-solid fa-star';
        star.style.cursor = 'pointer';
        star.style.pointerEvents = 'auto'; 
        star.style.transition = 'transform 0.2s, color 0.2s';
        star.style.color = '#888';
        star.style.opacity = '0.3';

        star.addEventListener('mouseover', () => {
            for(let j=0; j<5; j++) {
                const s = starsContainer.children[j];
                if(j < i) { s.style.color = '#9F00FF'; s.style.opacity = '1'; s.style.transform = 'scale(1.2)'; } 
                else { s.style.color = '#888'; s.style.opacity = '0.3'; s.style.transform = 'scale(1)'; }
            }
        });

        star.addEventListener('mouseout', () => {
            for(let j=0; j<5; j++) {
                const s = starsContainer.children[j];
                s.style.color = '#888'; s.style.opacity = '0.3'; s.style.transform = 'scale(1)';
            }
        });

        star.addEventListener('click', (e) => {
            e.stopPropagation();
            handleRatingSubmit(i);
        });
        starsContainer.appendChild(star);
    }
}

async function handleRatingSubmit(rating) {
    const { starsContainer, ratingArea } = getUI();
    
    // 1. UI Update (Optimistic)
    localStorage.setItem('getnaro_rated', 'true');
    localStorage.setItem('getnaro_rated_val', rating);
    starsContainer.style.pointerEvents = 'none';
    renderStars(rating);

    // 2. Show "Thanks" Animation
    const existingMsgs = document.querySelectorAll('.gn-thanks-msg');
    existingMsgs.forEach(msg => msg.remove());

    const msg = document.createElement('div');
    msg.className = 'gn-thanks-msg';
    msg.innerText = "Thanks for rating!";
    
    if (ratingArea) {
        ratingArea.appendChild(msg);
    } else {
        starsContainer.insertAdjacentElement('afterend', msg);
    }

    // 3. DB Update
    if (!firebaseOnline) {
        console.warn("Firebase offline - rating not saved");
        return;
    }

    try {
        const statsRef = doc(db, COLLECTION_NAME, STATS_DOC_ID);
        await updateDoc(statsRef, {
            totalStars: increment(rating),
            ratingCount: increment(1)
        });
        console.log("Rating saved successfully");
    } catch (e) {
        console.error("Rating Save Failed:", e);
    }
}
function bindDownloadButtons() {
    const buttons = {
        x64: document.getElementById("dl-x64"),
        x32: document.getElementById("dl-x32"),
        portable: document.getElementById("dl-portable"),
        minimal: document.getElementById("dl-minimal")
    };

    for (const [key, btn] of Object.entries(buttons)) {
        if (!btn) continue;

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            startDownload(btn, key);
        });
    }
}

function startDownload(button, type) {
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Starting...';
    button.disabled = true;

    // Increase download count
    if (firebaseOnline) {
        const statsRef = doc(db, COLLECTION_NAME, STATS_DOC_ID);
        updateDoc(statsRef, { downloads: increment(1) });
    }

    // Redirect to actual link
    setTimeout(() => {
        window.location.href = DOWNLOAD_LINKS[type];
        button.innerHTML = '<i class="fa-solid fa-check"></i> Started';
        button.disabled = false;
    }, 800);
}


async function startFirebase() {
    const { downloadCount, ratingValue, totalRatings } = getUI();
    const statsRef = doc(db, COLLECTION_NAME, STATS_DOC_ID);

    console.log("Starting Firebase connection...");

    try {
        // Try to read the document first
        const docSnap = await getDoc(statsRef);
        
        if (!docSnap.exists()) {
            console.log("Document doesn't exist, creating...");
            await setDoc(statsRef, { downloads: 0, totalStars: 0, ratingCount: 0 });
        } else {
            console.log("Document exists with data:", docSnap.data());
            // Immediately update UI with existing data
            updateUI(docSnap.data());
        }

        // Set up real-time listener
        onSnapshot(statsRef, 
            (snap) => {
                firebaseOnline = true;
                console.log("Firebase snapshot received:", snap.exists() ? snap.data() : "No data");
                
                if (snap.exists()) {
                    updateUI(snap.data());
                } else {
                    console.warn("Snapshot exists but has no data");
                    updateUI({ downloads: 0, ratingCount: 0, totalStars: 0 });
                }
            }, 
            (error) => {
                console.error("Firebase Listen Error:", error);
                console.error("Error code:", error.code);
                console.error("Error message:", error.message);
                firebaseOnline = false;
                
                // Show error in UI for debugging
                if (downloadCount) {
                    downloadCount.innerText = "Error loading";
                    downloadCount.style.color = "red";
                }
            }
        );
    } catch (e) { 
        console.error("DB Init Failed:", e);
        console.error("Error code:", e.code);
        console.error("Error message:", e.message);
    }
}

function updateUI(data) {
    const { downloadCount, ratingValue, totalRatings } = getUI();
    
    const downloads = data.downloads || 0;
    const rCount = data.ratingCount || 0;
    const tStars = data.totalStars || 0;
    const avg = rCount > 0 ? (tStars / rCount).toFixed(1) : "0.0";

    console.log(`Updating UI: Downloads=${downloads}, Rating=${avg}, Reviews=${rCount}`);

    if (downloadCount) {
        downloadCount.innerText = downloads.toLocaleString();
        downloadCount.style.color = ""; // Reset error color
    }

    if (ratingValue) ratingValue.innerText = avg;
    if (totalRatings) totalRatings.innerText = `(${rCount} reviews)`;

    if (!localStorage.getItem('getnaro_rated')) {
        renderStars(Math.round(parseFloat(avg)));
        initInteractiveRating(); 
    } else {
        const userRating = parseInt(localStorage.getItem('getnaro_rated_val')) || Math.round(parseFloat(avg));
        renderStars(userRating);
    }
}

// --- 5. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded");
    
    // Set up UI immediately
    bindDownloadButtons();
    renderStars(0);
    initInteractiveRating();

    // Authenticate and connect to Firebase
    console.log("Starting anonymous authentication...");
    signInAnonymously(auth)
        .then(() => {
            console.log("✓ Anonymous Auth Successful");
            startFirebase();
        })
        .catch((error) => {
            console.error("✗ Auth Failed:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            
            // Show error in UI
            const { downloadCount } = getUI();
            if (downloadCount) {
                downloadCount.innerText = "Auth failed";
                downloadCount.style.color = "red";
            }
        });
});
import { mainAuth, mainDb, mainFirestore, mainStorage } from './firebase-config.js';