/**
 * Universal Site Search and AI Assistant Module
 * This version uses robust array initialization to ensure data is loaded
 * universally, even on nested paths. It includes its own safe Firebase initialization.
 */

// --- Module Imports ---
// Using protocol-relative URLs for maximum network compatibility
import { getApps, initializeApp } from "//www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "//www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL VARIABLES ---
let BASE_URL = ''; 
let universalSearchData = []; 
let APP_DB = []; 
let db = null; // Local Firebase Firestore instance

// --- FIREBASE CONFIG (Used only if no other app is initialized) ---
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

// --- CORE FUNCTION: Get or Initialize DB instance (Safe, non-conflicting init) ---
function getFirestoreInstance() {
    if (db) return db;

    try {
        // Only initialize if no app is already present (View.html may initialize first)
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        db = getFirestore(app);
        return db;
    } catch (e) {
        console.error("FIREBASE ERROR: Failed to get Firestore instance for Search/AI.", e);
        return null;
    }
}

// --- AI ASSISTANT SETTINGS AND CONTEXT ---
const WORKER_URL = "https://getnaro-ai.narotech.workers.dev/"; 
const SETTINGS = { speechEnabled: true, navDelay: 1000, localPath: '' };
const SITE_CONTEXT = `IDENTITY: You are the Getnaro Assistant...`; // Snipped for brevity

let currentMode = 'menu';
let lastSuggestedItem = null;
let recognition = null;
let isListening = false;


// --- UI and Helper Functions ---
function getUiElements() {
    return {
        overlay: document.getElementById("gn-search-overlay"),
        openBtn: document.getElementById("gn-search-btn"),
        closeBtn: document.getElementById("gn-search-close"),
        input: document.getElementById("gn-search-input"),
        resultsBox: document.getElementById("gn-search-results"),
        popup: document.querySelector(".popup"),
        aiTrigger: document.getElementById('gn-ai-trigger'),
        aiOverlay: document.getElementById('gn-ai-overlay'),
        aiCloseBtn: document.getElementById('gn-ai-close'),
        aiChatBox: document.getElementById('gn-ai-chat'),
        aiInputField: document.getElementById('gn-ai-input'),
        aiSendBtn: document.getElementById('btn-send'),
        aiMicBtn: document.getElementById('btn-mic'),
        aiSpeakerBtn: document.getElementById('btn-speaker'),
        aiInputArea: document.querySelector('.gn-ai-input-area')
    };
}

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
        item.keywords.forEach(k => {
            if (k.includes(q)) score += 15;
        });
        if (category.includes(q)) score += 5;
        if (q.length > 2 && name.startsWith(q)) score += 10; 
        if (item.category === 'Account' && (q.includes('login') || q.includes('profile'))) score += 10;

        if (score > 0) matches.push({ ...item, score });
    });

    return matches.sort((a, b) => b.score - a.score).slice(0, 15);
}

function getAppUrl(item) { 
    return item.path || SETTINGS.localPath + item.id; 
}

function navigateTo(url, label) {
    addMessage(`Opening <b>${label}</b>...`, 'bot');
    speak(`Opening ${label}`);
    setTimeout(() => {
        window.location.href = url;
    }, SETTINGS.navDelay);
}

function scrollToBottom() {
    const ui = getUiElements();
    if(ui.aiChatBox) ui.aiChatBox.scrollTop = ui.aiChatBox.scrollHeight;
}

function addMessage(html, sender) {
    const ui = getUiElements();
    if(!ui.aiChatBox) return;
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerHTML = html;
    ui.aiChatBox.appendChild(div);
    scrollToBottom();
}

function createBtn(parent, label, onClickFunction) {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.className = 'gn-ai-option-btn';
    btn.type = "button";
    btn.onclick = function() { onClickFunction(); };
    parent.appendChild(btn);
}

function speak(text) {
    if (!SETTINGS.speechEnabled || typeof window.speechSynthesis === 'undefined') return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    window.speechSynthesis.speak(u);
}

const PAGES_DB = {
    "home": '',
    "login": '',
    "signup": '',
    "profile": '',
    "about": '',
    "contact": '',
    "faq": '',
    "policy": '',
    "community": '',
    "app": ''
};

function showRootMenu() {
    currentMode = 'menu';
    const ui = getUiElements();
    if(ui.aiInputArea) ui.aiInputArea.style.display = 'none';
    ui.aiChatBox.innerHTML = '';
    addMessage("👋 <b>Hi! I'm the Getnaro AI.</b>", 'bot');
    const div = document.createElement('div');
    div.className = 'msg bot gn-ai-options';
    createBtn(div, "🤖 AI Chat Mode", () => {
        currentMode = 'ai';
        if(ui.aiInputArea) ui.aiInputArea.style.display = 'flex';
        addMessage("AI Mode Active! Ask me to download something or navigate the site.", 'bot');
        speak("AI Mode Active. Ask me to download something.");
    });
    createBtn(div, "📂 Browse Apps", () => showCategories());
    createBtn(div, "👤 Account", () => {
        addMessage("Account Login", 'user');
        navigateTo(PAGES_DB.login, "Account Login Page");
    });
    ui.aiChatBox.appendChild(div);
    scrollToBottom();
}

function showCategories() {
    addMessage("Select a category:", 'bot');
    const div = document.createElement('div');
    div.className = 'msg bot gn-ai-options';
    const cats = [...new Set(APP_DB.map(a => a.category))];
    cats.forEach(cat => {
        createBtn(div, `📂 ${cat.toUpperCase()}`, () => showApps(cat));
    });
    createBtn(div, "⬅️ Back", () => showRootMenu());
    getUiElements().aiChatBox.appendChild(div);
    scrollToBottom();
}

function showApps(cat) {
    addMessage(`Apps in ${cat}:`, 'bot');
    const div = document.createElement('div');
    div.className = 'msg bot gn-ai-options';
    APP_DB.filter(a => a.category === cat).forEach(app => {
        createBtn(div, app.name, () => {
            addMessage(app.name, 'user');
            navigateTo(getAppUrl(app), app.name);
        });
    });
    createBtn(div, "⬅️ Back", () => showCategories());
    getUiElements().aiChatBox.appendChild(div);
    scrollToBottom();
}

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
                tags: data.tags || [],
                description: data.description || '',
                path: SETTINGS.localPath + doc.id,
                img: data.image || faviconPath,
                keywords: keywords // Use actual keywords from database
            });
        });
        
        if (dynamicApps.length > 0) {
            APP_DB = dynamicApps;
            
            // Push dynamic apps into the existing universalSearchData array
            APP_DB.forEach(app => {
                if (!universalSearchData.some(item => item.id === app.id)) {
                    universalSearchData.push(app);
                }
            });
            
            console.log(`Loaded ${dynamicApps.length} apps from Firebase into search index.`);
            console.log(`Total searchable items: ${universalSearchData.length}`);
            console.log("Apps loaded:", dynamicApps.map(a => a.name));
        } else {
            console.warn("No apps found in Firebase 'apps' collection.");
        }

    } catch (e) {
        console.error("AI Assistant: Failed to fetch dynamic apps from DB. Check security rules.", e);
    }
}

async function processQuery(rawQuery) {
    if (currentMode !== 'ai') return;
    const query = rawQuery.toLowerCase().trim();
    if (!query) return;

    addMessage(rawQuery, 'user');
    const ui = getUiElements();
    if (ui.aiInputField) ui.aiInputField.value = '';

    const confirmWords = ["yes", "sure", "install", "download", "do it", "go ahead", "open"];
    if (lastSuggestedItem && confirmWords.some(w => query.includes(w))) {
        navigateTo(getAppUrl(lastSuggestedItem), lastSuggestedItem.name);
        lastSuggestedItem = null;
        return;
    }
    
    const searchResults = universalSearch(query);
    const topResult = searchResults.length > 0 ? searchResults[0] : null;

    if (topResult && (query.includes('open') || query.includes('go to')) && (topResult.category === 'Page' || topResult.category === 'Account')) {
        navigateTo(topResult.path, topResult.name);
        return;
    }

    const loadingId = "load-" + Date.now();
    const loadDiv = document.createElement('div');
    loadDiv.className = 'msg bot loading-msg';
    loadDiv.id = loadingId;
    loadDiv.innerHTML = '<i>Thinking...</i>';
    ui.aiChatBox.appendChild(loadDiv);
    scrollToBottom();

    try {
        const res = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: rawQuery,
                system: SITE_CONTEXT + `\nUser Query: ${rawQuery}. Closest match found in index: ${topResult ? topResult.name : "None"}. Mention the top match and ask for confirmation/action.`
            })
        });

        const data = await res.json();
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();

        if (data.reply) {
            addMessage(data.reply, 'bot');
            speak(data.reply);

            if (topResult) {
                lastSuggestedItem = topResult;
                const actionVerb = topResult.category === 'Page' || topResult.category === 'Account' ? 'Go to' : 'Download';
                
                const div = document.createElement('div');
                div.className = 'msg bot gn-ai-options';
                
                createBtn(div, `${actionVerb} ${topResult.name}`, () => {
                    addMessage(`${actionVerb} ${topResult.name}`, 'user');
                    navigateTo(getAppUrl(topResult), topResult.name);
                });

                ui.aiChatBox.appendChild(div);
                scrollToBottom();
            }
        }
    } catch (err) {
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();
        console.error("AI API Error:", err);
        
        if (topResult) {
            lastSuggestedItem = topResult;
            const actionVerb = topResult.category === 'Page' || topResult.category === 'Account' ? 'Go to' : 'Download';

            addMessage(`AI is temporarily offline, but I found <b>${topResult.name}</b> in our index!`, 'bot');
            
            const div = document.createElement('div');
            div.className = 'msg bot gn-ai-options';
            createBtn(div, `${actionVerb} ${topResult.name}`, () => navigateTo(getAppUrl(topResult), topResult.name));
            ui.aiChatBox.appendChild(div);

        } else {
            addMessage("Connection error. The AI is offline and no matching apps were found.", 'bot');
        }
    }
}

// -----------------------------
// DATA INITIALIZATION FUNCTION (Guaranteed BASE_URL access)
// -----------------------------
function initializeSearchData() {
    BASE_URL = window.location.origin;
    SETTINGS.localPath = `${BASE_URL}/pages/view.html?id=`;
    const faviconPath = `${BASE_URL}/assests/Favicon.png`;
    
    // 1. Clear array to avoid duplicates if accidentally run twice
    universalSearchData.length = 0; 
    
    // 2. Initialize PAGES_DB with absolute paths
    PAGES_DB.home = `${BASE_URL}/index.html`;
    PAGES_DB.login = `${BASE_URL}/pages/login.html`;
    PAGES_DB.signup = `${BASE_URL}/pages/signup.html`;
    PAGES_DB.profile = `${BASE_URL}/pages/profile.html`;
    PAGES_DB.about = `${BASE_URL}/pages/about.html`;
    PAGES_DB.contact = `${BASE_URL}/pages/contact.html`;
    PAGES_DB.faq = `${BASE_URL}/pages/faq.html`;
    PAGES_DB.policy = `${BASE_URL}/pages/privacypolicy.html`;
    PAGES_DB.community = `${BASE_URL}/pages/community.html`;
    PAGES_DB.app = `${BASE_URL}/pages/getnaro-app.html`;

    // 3. Populate the primary search index using Array.push() for safety
    
    // Static App Entries
    universalSearchData.push({ id: 'ccleaner', name: 'CCleaner Official Installer', category: 'Utilities', path: `${BASE_URL}/pages/view.html?id=ccleaner`, img: faviconPath, keywords: ['cleaner', 'maintenance', 'optimize', 'disk', 'system', 'crap cleaner'] });
    universalSearchData.push({ id: 'amd-drivers', name: 'AMD Radeon Software Adrenalin', category: 'Drivers', path: `${BASE_URL}/pages/view.html?id=amd-drivers`, img: faviconPath, keywords: ['amd', 'radeon', 'drivers', 'gpu', 'graphics', 'update'] });
    universalSearchData.push({ id: 'nvidia-geforce', name: 'NVIDIA GeForce Experience', category: 'Drivers', path: `${BASE_URL}/pages/view.html?id=nvidia-geforce`, img: faviconPath, keywords: ['nvidia', 'geforce', 'drivers', 'gaming', 'graphics', 'gforce'] });
    universalSearchData.push({ id: 'vs-code', name: 'Visual Studio Code', category: 'Development', path: `${BASE_URL}/pages/view.html?id=vs-code`, img: faviconPath, keywords: ['vs code', 'editor', 'code', 'development', 'programming', 'ide'] });
    universalSearchData.push({ id: 'discord-app', name: 'Discord Desktop App', category: 'Communication', path: `${BASE_URL}/pages/view.html?id=discord-app`, img: faviconPath, keywords: ['discord', 'chat', 'voice', 'community', 'social'] });
    universalSearchData.push({ id: 'vlc-player', name: 'VLC Media Player', category: 'Multimedia', path: `${BASE_URL}/pages/view.html?id=vlc-player`, img: faviconPath, keywords: ['vlc', 'media', 'player', 'video', 'audio', 'movie'] });
    universalSearchData.push({ id: 'steam-client', name: 'Steam Gaming Client', category: 'Gaming', path: `${BASE_URL}/pages/view.html?id=steam-client`, img: faviconPath, keywords: ['steam', 'gaming', 'store', 'valve'] });
    universalSearchData.push({ id: 'chrome', name: 'Google Chrome Browser', category: 'Browser', path: `${BASE_URL}/pages/view.html?id=chrome`, img: faviconPath, keywords: ['chrome', 'browser', 'web', 'google'] });
    universalSearchData.push({ id: 'firefox', name: 'Mozilla Firefox Browser', category: 'Browser', path: `${BASE_URL}/pages/view.html?id=firefox`, img: faviconPath, keywords: ['firefox', 'browser', 'mozilla', 'web'] });
    universalSearchData.push({ id: '7zip', name: '7-Zip File Archiver', category: 'Utilities', path: `${BASE_URL}/pages/view.html?id=7zip`, img: faviconPath, keywords: ['7zip', 'zip', 'unzip', 'archive', 'compress'] });
    
    // Static Page Entries
    universalSearchData.push({ id: 'index', name: 'Getnaro Home Page', category: 'Page', path: PAGES_DB.home, img: faviconPath, keywords: ['home', 'main', 'index'] });
    universalSearchData.push({ id: 'getnaro-app', name: 'Download Getnaro Windows App', category: 'Page', path: PAGES_DB.app, img: faviconPath, keywords: ['download', 'client', 'windows', 'getnaro', 'installer'] });
    universalSearchData.push({ id: 'about', name: 'About Us Page', category: 'Page', path: PAGES_DB.about, img: faviconPath, keywords: ['about', 'team', 'company', 'mission', 'vision'] });
    universalSearchData.push({ id: 'faq', name: 'Frequently Asked Questions', category: 'Page', path: PAGES_DB.faq, img: faviconPath, keywords: ['faq', 'questions', 'support', 'help'] });
    universalSearchData.push({ id: 'contact', name: 'Contact Us Page', category: 'Page', path: PAGES_DB.contact, img: faviconPath, keywords: ['contact', 'email', 'support', 'business'] });
    universalSearchData.push({ id: 'coc', name: 'Code of Conduct', category: 'Page', path: PAGES_DB.coc, img: faviconPath, keywords: ['coc', 'rules', 'conduct', 'policy'] });
    universalSearchData.push({ id: 'privacypolicy', name: 'Privacy Policy Page', category: 'Page', path: PAGES_DB.policy, img: faviconPath, keywords: ['privacy', 'data', 'policy', 'security'] });
    universalSearchData.push({ id: 'signup', name: 'Sign Up / Create Account', category: 'Account', path: PAGES_DB.signup, img: faviconPath, keywords: ['signup', 'register', 'account', 'login'] });
    universalSearchData.push({ id: 'profile', name: 'My Profile / User Dashboard', category: 'Account', path: PAGES_DB.profile, img: faviconPath, keywords: ['profile', 'dashboard', 'user', 'settings'] });

    // Sanity check after initialization
    if (universalSearchData.length === 0) {
        console.error("CRITICAL ERROR: universalSearchData is empty after initialization.");
    } else {
        console.log(`Search data initialized successfully with ${universalSearchData.length} static entries.`);
    }
}

// -----------------------------
// MAIN INITIALIZATION WRAPPER
// -----------------------------
function initSearchAndAssistant() {
    if (window.location.pathname.includes("view.html")) return;
    
    // CRITICAL: Initialize data inside the ready function to ensure BASE_URL is set correctly.
    initializeSearchData();
    
    // DEBUG: Log what's in the search index
    console.log("=== SEARCH INDEX DEBUG ===");
    console.log("Total items in search:", universalSearchData.length);
    console.log("Pages:", universalSearchData.filter(i => i.category === 'Page').map(i => i.name));
    console.log("Apps:", universalSearchData.filter(i => i.category !== 'Page' && i.category !== 'Account').map(i => i.name));
    console.log("========================");
    
    // --- 1. Search UI Initialization ---
    const ui = getUiElements();

    // CRITICAL: OPEN SEARCH OVERLAY LISTENER
    if (ui.openBtn && ui.overlay && ui.input && ui.resultsBox) {
        ui.openBtn.addEventListener("click", () => {
            if (ui.popup) ui.popup.style.display = "none";
            ui.overlay.style.display = "flex";
            ui.input.value = "";
            ui.resultsBox.innerHTML = `<div class="no-result initial-msg">Type to search for apps, drivers, or site pages.</div>`;
            ui.input.focus();
        });
    } else {
        console.warn("Search UI elements not found. Search button may not be clickable.");
    }

    // CLOSE SEARCH OVERLAY LISTENER
    ui.closeBtn?.addEventListener("click", () => {
        if (ui.overlay) ui.overlay.style.display = "none";
        if (ui.input) ui.input.value = "";
        if (ui.resultsBox) ui.resultsBox.innerHTML = "";
    });

    // INPUT LISTENER (DEBOUNCED)
    let debounceTimer;
    if (ui.input) {
        ui.input.addEventListener("input", () => {
            clearTimeout(debounceTimer);
            
            debounceTimer = setTimeout(() => {
                const query = ui.input.value.trim();
                if (!ui.resultsBox) return;
                ui.resultsBox.innerHTML = "";
        
                if (query.length === 0) {
                    ui.resultsBox.innerHTML = `<div class="no-result initial-msg">Type to search for apps, drivers, or site pages.</div>`;
                    return;
                }
        
                const results = universalSearch(query);
        
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
                    
                    // FIXED: Proper navigation that triggers full page reload
                    itemDiv.onclick = () => {
                        console.log("Navigating to:", item.path);
                        
                        // Close search overlay
                        if (ui.overlay) ui.overlay.style.display = "none";
                        if (ui.input) ui.input.value = "";
                        if (ui.resultsBox) ui.resultsBox.innerHTML = "";
                        
                        // Use setTimeout to ensure cleanup happens before navigation
                        setTimeout(() => {
                            window.location.href = item.path;
                        }, 50);
                    };

                    ui.resultsBox.appendChild(itemDiv);
                });
                
                if (ui.resultsBox.children.length > 0) {
                    ui.resultsBox.style.padding = '15px';
                } else {
                    ui.resultsBox.style.padding = '0';
                }
            }, 200);
        });
    }

    // --- 2. AI Assistant Initialization ---
    if (ui.aiTrigger) {
        initAiAssistant(ui);
    }
}

// Function to initialize AI specific listeners
function initAiAssistant(ui) {
    fetchAppsFromDB(); 

    const setTriggerState = (isOpen) => {
        if (isOpen) {
            ui.aiTrigger.innerHTML = '<i class="fa-solid fa-xmark" style="color: white !important;"></i> <span style="color: white !important;">Close</span>';
            ui.aiTrigger.style.background = '#ff4444'; 
            ui.aiTrigger.style.boxShadow = '0 5px 15px rgba(255, 68, 68, 0.4)';
        } else {
            ui.aiTrigger.innerHTML = '<i class="fa-solid fa-robot" style="color: white !important;"></i> <span style="color: white !important;">Chat Now</span>';
            ui.aiTrigger.style.background = ''; 
            ui.aiTrigger.style.boxShadow = '';
        }
    };

    if (ui.aiTrigger) {
        ui.aiTrigger.addEventListener('click', () => {
            const isOpen = ui.aiOverlay.classList.contains('active');
            if (isOpen) {
                ui.aiOverlay.classList.remove('active');
                window.speechSynthesis.cancel();
                setTriggerState(false);
            } else {
                ui.aiOverlay.classList.add('active');
                if (ui.aiChatBox && ui.aiChatBox.children.length < 2) showRootMenu();
                setTriggerState(true);
            }
        });
    }
    
    ui.aiCloseBtn?.addEventListener('click', () => {
        ui.aiOverlay.classList.remove('active');
        window.speechSynthesis.cancel();
        setTriggerState(false);
    });

    ui.aiSendBtn?.addEventListener('click', () => processQuery(ui.aiInputField.value));
    ui.aiInputField?.addEventListener('keypress', e => { if (e.key === 'Enter') processQuery(ui.aiInputField.value); });

    ui.aiSpeakerBtn?.addEventListener('click', () => {
        SETTINGS.speechEnabled = !SETTINGS.speechEnabled;
        if (!SETTINGS.speechEnabled) window.speechSynthesis.cancel();
        ui.aiSpeakerBtn.innerHTML = SETTINGS.speechEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    });

    if (ui.aiMicBtn && typeof window.webkitSpeechRecognition !== 'undefined') {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SR();
        recognition.continuous = false;
        recognition.onstart = () => { isListening = true; ui.aiMicBtn.classList.add('active'); ui.aiInputField.placeholder = "Listening..."; };
        recognition.onend = () => { isListening = false; ui.aiMicBtn.classList.remove('active'); ui.aiInputField.placeholder = "Type message..."; };
        recognition.onresult = (e) => processQuery(e.results[0][0].transcript);
        ui.aiMicBtn.addEventListener('click', () => {
            if (currentMode !== 'ai') return addMessage("Please click 'AI Chat Mode' first.", 'bot');
            isListening ? recognition.stop() : recognition.start();
        });
    } else if (ui.aiMicBtn) {
        ui.aiMicBtn.style.display = 'none';
    }
}

// Attach the main function to the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', initSearchAndAssistant);