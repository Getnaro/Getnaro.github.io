/**
 * Universal Site Search Module
 * Corrected to use firebase-config.js for dependency management.
 */

// --- Module Imports ---
// We import ONLY the necessary functions from the specific Firebase services
import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// We import the main app instance from the central config file
import { mainApp } from './firebase-config.js'; 


// --- GLOBAL VARIABLES ---
let BASE_URL = ''; 
let universalSearchData = []; 
let db = null; // Firestore instance

// --- Get or Initialize Firestore ---
// Function updated to use the imported mainApp instance
function getFirestoreInstance() {
    if (db) return db;
    try {
        db = getFirestore(mainApp);
        return db;
    } catch (e) {
        console.error("FIREBASE ERROR: Failed to get Firestore instance for Search.", e);
        return null;
    }
}

// --- UI Elements ---
function getUiElements() {
    return {
        overlay: document.getElementById("gn-search-overlay"),
        openBtn: document.getElementById("gn-search-btn"),
        closeBtn: document.getElementById("gn-search-close"),
        input: document.getElementById("gn-search-input"),
        resultsBox: document.getElementById("gn-search-results"),
        // Removed: popup (use existing methods to hide it if needed)
    };
}

// --- Search Algorithm (No changes needed) ---
function universalSearch(query) {
    const q = query.toLowerCase().trim();
    let matches = [];

    if (universalSearchData.length === 0) {
        return [];
    }

    universalSearchData.forEach(item => {
        let score = 0;
        const name = item.name.toLowerCase();
        const category = item.category.toLowerCase();
        
        if (name === q) score += 50;
        if (name.includes(q)) score += 20;
        
        if (item.keywords) {
            item.keywords.forEach(k => {
                if (k.toLowerCase().includes(q)) score += 15;
            });
        }
        
        if (category.includes(q)) score += 5;
        if (q.length > 2 && name.startsWith(q)) score += 10; 
        if (item.category === 'Account' && (q.includes('login') || q.includes('profile'))) score += 10;

        if (score > 0) matches.push({ ...item, score });
    });

    return matches.sort((a, b) => b.score - a.score).slice(0, 15);
}

// --- Fetch Apps from Firebase (No changes needed except using the correct DB instance) ---
async function fetchAppsFromDB() {
    const dbInstance = getFirestoreInstance();
    if (!dbInstance) {
        console.warn("Firebase not initialized. Apps won't be loaded into search.");
        return;
    }

    try {
        const querySnapshot = await getDocs(collection(dbInstance, "apps"));
        const dynamicApps = [];
        const faviconPath = `${BASE_URL}/assests/Favicon.png`; 
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Build keywords array from tags and name
            const keywords = [
                ...(data.tags || []),
                data.name.toLowerCase(),
                data.category ? data.category.toLowerCase() : 'tool'
            ];
            
            dynamicApps.push({
                id: doc.id,
                name: data.name,
                category: data.category || 'tools',
                description: data.description || '',
                path: `${BASE_URL}/pages/view.html?id=${doc.id}`,
                img: data.image || faviconPath,
                keywords: keywords
            });
        });
        
        if (dynamicApps.length > 0) {
            dynamicApps.forEach(app => {
                if (!universalSearchData.some(item => item.id === app.id)) {
                    universalSearchData.push(app);
                }
            });
            
            console.log(`✅ Loaded ${dynamicApps.length} apps from Firebase into search.`);
            console.log(`📊 Total searchable items: ${universalSearchData.length}`);
        } else {
            console.warn("⚠️ No apps found in Firebase 'apps' collection.");
        }

    } catch (e) {
        console.error("❌ Failed to fetch apps from Firebase:", e);
    }
}

// --- Initialize Search Data (Pages Only - No changes needed) ---
function initializeSearchData() {
    BASE_URL = window.location.origin;
    const faviconPath = `${BASE_URL}/assests/Favicon.png`;
    
    // Clear array completely
    universalSearchData = [];
    
    const PAGES_DB = {
        home: `${BASE_URL}/index.html`,
        login: `${BASE_URL}/pages/login.html`,
        signup: `${BASE_URL}/pages/signup.html`,
        profile: `${BASE_URL}/pages/profile.html`,
        about: `${BASE_URL}/pages/about.html`,
        contact: `${BASE_URL}/pages/contact.html`,
        faq: `${BASE_URL}/pages/faq.html`,
        policy: `${BASE_URL}/pages/privacypolicy.html`,
        community: `${BASE_URL}/pages/community.html`,
        app: `${BASE_URL}/pages/getnaro-app.html`
    };

    // Add static page entries
    universalSearchData.push({ id: 'index', name: 'Getnaro Home Page', category: 'Page', path: PAGES_DB.home, img: faviconPath, keywords: ['home', 'main', 'index'] });
    universalSearchData.push({ id: 'getnaro-app', name: 'Download Getnaro Windows App', category: 'Page', path: PAGES_DB.app, img: faviconPath, keywords: ['download', 'client', 'windows', 'getnaro', 'installer'] });
    universalSearchData.push({ id: 'about', name: 'About Us Page', category: 'Page', path: PAGES_DB.about, img: faviconPath, keywords: ['about', 'team', 'company', 'mission', 'vision'] });
    universalSearchData.push({ id: 'faq', name: 'Frequently Asked Questions', category: 'Page', path: PAGES_DB.faq, img: faviconPath, keywords: ['faq', 'questions', 'support', 'help'] });
    universalSearchData.push({ id: 'contact', name: 'Contact Us Page', category: 'Page', path: PAGES_DB.contact, img: faviconPath, keywords: ['contact', 'email', 'support', 'business'] });
    universalSearchData.push({ id: 'privacypolicy', name: 'Privacy Policy Page', category: 'Page', path: PAGES_DB.policy, img: faviconPath, keywords: ['privacy', 'data', 'policy', 'security'] });
    universalSearchData.push({ id: 'signup', name: 'Sign Up / Create Account', category: 'Account', path: PAGES_DB.signup, img: faviconPath, keywords: ['signup', 'register', 'account', 'login'] });
    universalSearchData.push({ id: 'profile', name: 'My Profile / User Dashboard', category: 'Account', path: PAGES_DB.profile, img: faviconPath, keywords: ['profile', 'dashboard', 'user', 'settings'] });

    console.log(`✅ Search initialized with ${universalSearchData.length} PAGES ONLY.`);
}

// --- Main Search Initialization ---
async function initSearch() {
    if (window.location.pathname.includes("view.html")) {
        console.log("⏭️ Skipping search init on view.html");
        return;
    }
    
    initializeSearchData();
    const ui = getUiElements();
    
    if (!ui.openBtn || !ui.overlay || !ui.input || !ui.resultsBox) {
        console.warn("⚠️ Search UI elements not found.");
        return;
    }

    await fetchAppsFromDB();
    
    console.log("🔍 Final search index:", universalSearchData.map(i => `${i.name} (${i.category})`));

    // OPEN SEARCH OVERLAY
    ui.openBtn.addEventListener("click", () => {
        ui.overlay.style.display = "flex";
        ui.input.value = "";
        ui.resultsBox.innerHTML = `<div class="no-result initial-msg">Type to search for apps, drivers, or site pages.</div>`;
        ui.input.focus();
    });

    // CLOSE SEARCH OVERLAY
    if (ui.closeBtn) {
        ui.closeBtn.addEventListener("click", () => {
            ui.overlay.style.display = "none";
            ui.input.value = "";
            ui.resultsBox.innerHTML = "";
        });
    }

    // SEARCH INPUT (DEBOUNCED)
    let debounceTimer;
    ui.input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        
        debounceTimer = setTimeout(() => {
            const query = ui.input.value.trim();
            ui.resultsBox.innerHTML = "";
    
            if (query.length === 0) {
                ui.resultsBox.innerHTML = `<div class="no-result initial-msg">Type to search for apps, drivers, or site pages.</div>`;
                return;
            }
    
            const results = universalSearch(query);
            
            console.log(`🔎 Search query: "${query}" - Found ${results.length} results`);
    
            if (results.length === 0) {
                ui.resultsBox.innerHTML = `<div class="no-result">No results found for "${query}". Try different keywords.</div>`;
                return;
            }
    
            results.forEach(item => {
                const resultType = item.category === 'Page' || item.category === 'Account' ? 'Site Page' : 'Application';
                const itemDiv = document.createElement("div");
                itemDiv.classList.add("search-result-item");
                itemDiv.dataset.path = item.path;
    
                itemDiv.innerHTML = `
                    <img src="${item.img}" onerror="this.onerror=null; this.src='${BASE_URL}/assests/Favicon.png'">
                    <div class="search-info">
                        <h4>${item.name}</h4>
                        <p class="category-tag">${item.category.toUpperCase()} • ${resultType}</p>
                    </div>
                    <i class="fa-solid fa-arrow-right search-action-icon"></i>
                `;
                
                // Navigation handler
                itemDiv.onclick = () => {
                    console.log("🔗 Navigating to:", item.path);
                    
                    ui.overlay.style.display = "none";
                    ui.input.value = "";
                    ui.resultsBox.innerHTML = "";
                    
                    setTimeout(() => {
                        window.location.href = item.path;
                    }, 50);
                };

                ui.resultsBox.appendChild(itemDiv);
            });
            
            ui.resultsBox.style.padding = ui.resultsBox.children.length > 0 ? '15px' : '0';
        }, 200);
    });

    console.log("✅ Search module initialized successfully!");
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initSearch);