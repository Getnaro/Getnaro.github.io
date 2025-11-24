/**
 * GETNARO AI ASSISTANT - COMPLETE FINAL VERSION
 * Fixes: Trigger Button Toggle, Internal Button Clicks, Navigation, Voice
 */

// ==========================================
// --- 1. CONFIGURATION ---
// ==========================================
const WORKER_URL = "https://getnaro-ai.narotech.workers.dev/"; 

const SETTINGS = {
    speechEnabled: true,     // Auto-speak AI responses
    navDelay: 1000,          // Delay before redirecting
    localPath: "/downloads/" // Absolute path for reliability
};

// ==========================================
// --- 2. KNOWLEDGE BASE ---
// ==========================================

const SITE_CONTEXT = `
IDENTITY: You are the Getnaro Assistant.
WEBSITE: www.getnaro.com.
DEVELOPER: NaroTech.
MISSION: Safe, ad-free, direct downloads for Windows software.

POLICIES:
- Privacy: No data collection.
- Safety: Official redirects only.
- Cost: 100% Free.

INSTRUCTIONS:
- If the user asks for an app we have, describe it briefly.
- If the user confirms (says "yes", "install", "do it"), I will handle the redirect.
`;

const APP_DB = [
  // DRIVERS
  { id: "gigabyte_driver", name: "GIGABYTE Driver", category: "drivers", tags: ["gpu", "motherboard"] },
  { id: "amd_driver", name: "AMD Driver", category: "drivers", tags: ["amd", "gpu", "radeon"] },
  { id: "amd_adrenalin", name: "AMD Adrenalin", category: "drivers", tags: ["amd", "gaming", "software"] },
  { id: "amd_pro", name: "AMD Pro Edition", category: "drivers", tags: ["workstation", "pro"] },
  { id: "nvidia_app", name: "NVIDIA App", category: "drivers", tags: ["geforce", "gpu", "graphics"] },
  { id: "intel_graphics", name: "Intel Graphics", category: "drivers", tags: ["arc", "iris", "display"] },
  { id: "asrock_tweak", name: "ASRock Tweak", category: "drivers", tags: ["tuning", "gpu"] },
  { id: "asrock_downloads", name: "ASRock Downloads", category: "drivers", tags: ["motherboard"] },
  { id: "asus_downloads", name: "ASUS Downloads", category: "drivers", tags: ["armoury"] },
  { id: "msi_downloads", name: "MSI Downloads", category: "drivers", tags: ["center", "dragon"] },
  { id: "lg_display_driver", name: "LG Display Driver", category: "drivers", tags: ["monitor"] },
  { id: "crucial_disk", name: "Crucial Disk Manager", category: "drivers", tags: ["ssd"] },

  // TOOLS
  { id: "msi_afterburner", name: "MSI Afterburner", category: "tools", tags: ["fps", "overclock"] },
  { id: "cpu-z", name: "CPU-Z", category: "tools", tags: ["specs", "info"], url: "cpu-z.html" },
  { id: "ventoy_booter", name: "Ventoy", category: "tools", tags: ["usb", "boot"], url: "ventoy-booter.html" },
  { id: "winrar_archiver", name: "WinRAR", category: "tools", tags: ["zip", "extract"] },
  { id: "nanazip", name: "NanaZip", category: "tools", tags: ["7zip", "extract"] },
  { id: "canva_editor", name: "Canva", category: "tools", tags: ["design", "photo"] },
  { id: "free_download_manager", name: "FDM", category: "tools", tags: ["download", "speed"], url: "free-download-manager.html" },
  { id: "speedtest_pc", name: "SpeedTest", category: "tools", tags: ["internet", "wifi"] },
  { id: "traffic_monitor", name: "Traffic Monitor", category: "tools", tags: ["network"] },
  { id: "translucenttb", name: "TranslucentTB", category: "tools", tags: ["taskbar", "clear"] },
  { id: "lively_wallpaper", name: "Lively Wallpaper", category: "tools", tags: ["desktop", "live"] },
  { id: "ear_trumpet", name: "EarTrumpet", category: "tools", tags: ["volume", "audio"] },
  { id: "parsec_remote", name: "Parsec", category: "tools", tags: ["remote", "gaming"] },
  { id: "ddu_uninstaller", name: "DDU Uninstaller", category: "tools", tags: ["driver", "clean"] },
  { id: "dns_changer", name: "DNS Changer", category: "tools", tags: ["internet", "dns"] },
  { id: "ninite_all_apps", name: "Ninite", category: "tools", tags: ["installer", "bulk"] },

  // SOCIAL
  { id: "arattai_chat", name: "Arattai", category: "desi", tags: ["chat", "india", "zoho"] },
  { id: "telegram_pc", name: "Telegram", category: "social", tags: ["chat", "messenger"] },
  { id: "whatsapp_pc", name: "WhatsApp", category: "social", tags: ["chat", "messenger"] },
  { id: "chatgpt_pc", name: "ChatGPT", category: "social", tags: ["ai", "bot"] },
  { id: "lm_studio", name: "LM Studio", category: "social", tags: ["ai", "local"] },

  // OPEN SOURCE
  { id: "local_send", name: "LocalSend", category: "opensource", tags: ["share", "wifi"] },
  { id: "obs_studio", name: "OBS Studio", category: "opensource", tags: ["record", "stream"] },
  { id: "ulaa_browser", name: "Ulaa Browser", category: "opensource", tags: ["browser", "zoho"] },
  { id: "vscode_pc", name: "VS Code", category: "opensource", tags: ["code", "editor"] },
  { id: "sublime_text", name: "Sublime Text", category: "opensource", tags: ["code", "text"] },
  { id: "github_pc", name: "GitHub Desktop", category: "opensource", tags: ["git", "version"], url: "git-pc.html" },

  // GAMING
  { id: "epic_games", name: "Epic Games", category: "gaming", tags: ["store", "fortnite"] },
  { id: "steam_client", name: "Steam", category: "gaming", tags: ["store", "valve"] },
  { id: "bluestacks_a13", name: "BlueStacks", category: "gaming", tags: ["android", "emulator"] }
];

const PAGES_DB = {
    "home": "/index.html",
    "login": "/pages/login.html",
    "signup": "/pages/signup.html",
    "profile": "/pages/profile.html",
    "about": "/pages/about.html",
    "contact": "/pages/contact.html",
    "faq": "/pages/faq.html",
    "policy": "/pages/privacypolicy.html",
    "community": "/pages/community.html",
    "app": "/pages/getnaro-app.html"
};

// ==========================================
// --- 3. UI ELEMENTS ---
// ==========================================
const ui = {
    trigger: document.getElementById('gn-ai-trigger'),
    overlay: document.getElementById('gn-ai-overlay'),
    closeBtn: document.getElementById('gn-ai-close'),
    chatBox: document.getElementById('gn-ai-chat'),
    inputField: document.getElementById('gn-ai-input'),
    sendBtn: document.getElementById('btn-send'),
    micBtn: document.getElementById('btn-mic'),
    speakerBtn: document.getElementById('btn-speaker'),
    inputArea: document.querySelector('.gn-ai-input-area')
};

let currentMode = 'menu'; 
let recognition = null;
let isListening = false;
let lastSuggestedApp = null;

// ==========================================
// --- 4. CORE NAVIGATION ---
// ==========================================

function getAppUrl(app) {
    if (app.url) return SETTINGS.localPath + app.url;
    let filename = app.id.replace(/_/g, '-') + ".html";
    return SETTINGS.localPath + filename;
}

function navigateTo(url, label) {
    addMessage(`Opening <b>${label}</b>...`, 'bot');
    speak(`Opening ${label}`);
    setTimeout(() => {
        window.location.href = url;
    }, SETTINGS.navDelay);
}

function scrollToBottom() {
    if(ui.chatBox) ui.chatBox.scrollTop = ui.chatBox.scrollHeight;
}

function addMessage(html, sender) {
    if(!ui.chatBox) return;
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerHTML = html;
    ui.chatBox.appendChild(div);
    scrollToBottom();
}

// ==========================================
// --- 5. BUTTON CREATOR (DIRECT BINDING) ---
// ==========================================
function createBtn(parent, label, onClickFunction) {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.className = 'gn-ai-option-btn';
    btn.type = "button"; 
    
    // Direct click handler fixes the "button not working" issue
    btn.onclick = function() {
        onClickFunction();
    };
    
    parent.appendChild(btn);
}

// ==========================================
// --- 6. MENUS & ACTIONS ---
// ==========================================

function showRootMenu() {
    currentMode = 'menu';
    if(ui.inputArea) ui.inputArea.style.display = 'none';
    ui.chatBox.innerHTML = ''; 
    addMessage("👋 <b>Hi! I'm the Getnaro AI.</b>", 'bot');
    
    const div = document.createElement('div');
    div.className = 'msg bot gn-ai-options';
    
    createBtn(div, "🤖 AI Chat Mode", () => {
        currentMode = 'ai';
        if(ui.inputArea) ui.inputArea.style.display = 'flex';
        addMessage("AI Mode Active! Ask me to download something.", 'bot');
        speak("AI Mode Active");
    });

    createBtn(div, "📂 Browse Apps", () => showCategories());
    
    createBtn(div, "👤 Account", () => {
        addMessage("Account", 'user');
        navigateTo(PAGES_DB.login, "Account");
    });

    ui.chatBox.appendChild(div);
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
    ui.chatBox.appendChild(div);
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
    ui.chatBox.appendChild(div);
    scrollToBottom();
}

// ==========================================
// --- 7. INTELLIGENCE LOGIC ---
// ==========================================

async function processQuery(rawQuery) {
    if (currentMode !== 'ai') return;
    const query = rawQuery.toLowerCase().trim();
    if (!query) return;

    addMessage(rawQuery, 'user');
    if (ui.inputField) ui.inputField.value = '';

    // AUTO-CONFIRMATION
    const confirmWords = ["yes", "sure", "install", "download", "do it", "go ahead"];
    if (lastSuggestedApp && confirmWords.some(w => query.includes(w))) {
        navigateTo(getAppUrl(lastSuggestedApp), lastSuggestedApp.name);
        lastSuggestedApp = null;
        return;
    }

    // DIRECT LOCAL MATCH
    let foundApp = APP_DB.find(app => query.includes(app.name.toLowerCase())) ||
                   APP_DB.find(app => app.tags.some(tag => query.includes(tag)));

    if (foundApp && (query.includes('download') || query.includes('install') || query.includes('get'))) {
        navigateTo(getAppUrl(foundApp), foundApp.name);
        return;
    }

    // AI REQUEST
    const loadingId = "load-" + Date.now();
    const loadDiv = document.createElement('div');
    loadDiv.className = 'msg bot loading-msg';
    loadDiv.id = loadingId;
    loadDiv.innerHTML = '<i>Thinking...</i>';
    ui.chatBox.appendChild(loadDiv);
    scrollToBottom();

    try {
        const res = await fetch(WORKER_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: rawQuery,
                system: SITE_CONTEXT + `\nUser Query: ${rawQuery}. If match found (${foundApp ? foundApp.name : "None"}), explain it.`
            })
        });

        const data = await res.json();
        document.getElementById(loadingId).remove();

        if (data.reply) {
            addMessage(data.reply, 'bot');
            speak(data.reply);

            if (foundApp) {
                lastSuggestedApp = foundApp;
                const div = document.createElement('div');
                div.className = 'msg bot gn-ai-options';
                
                createBtn(div, `Download ${foundApp.name}`, () => {
                    addMessage(`Download ${foundApp.name}`, 'user');
                    navigateTo(getAppUrl(foundApp), foundApp.name);
                });
                
                ui.chatBox.appendChild(div);
                scrollToBottom();
            }
        }
    } catch (err) {
        document.getElementById(loadingId).remove();
        if (foundApp) {
            lastSuggestedApp = foundApp;
            addMessage(`AI offline, but I found <b>${foundApp.name}</b>!`, 'bot');
            const div = document.createElement('div');
            div.className = 'msg bot gn-ai-options';
            createBtn(div, `Download ${foundApp.name}`, () => navigateTo(getAppUrl(foundApp), foundApp.name));
            ui.chatBox.appendChild(div);
        } else {
            addMessage("Connection error.", 'bot');
        }
    }
}

// ==========================================
// --- 8. UTILITIES & INIT ---
// ==========================================

function speak(text) {
    if (!SETTINGS.speechEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    window.speechSynthesis.speak(u);
}

function init() {
    // HELPER: Change Button Appearance
    const setTriggerState = (isOpen) => {
        if (isOpen) {
            ui.trigger.innerHTML = '<i class="fa-solid fa-xmark" style="color: white !important;"></i> <span style="color: white !important;">Close</span>';
            ui.trigger.style.background = '#ff4444'; 
            ui.trigger.style.boxShadow = '0 5px 15px rgba(255, 68, 68, 0.4)';
        } else {
            ui.trigger.innerHTML = '<i class="fa-solid fa-robot" style="color: white !important;"></i> <span style="color: white !important;">Chat Now</span>';
            ui.trigger.style.background = ''; 
            ui.trigger.style.boxShadow = '';
        }
    };

    // 1. TRIGGER BUTTON LOGIC
    if (ui.trigger) {
        ui.trigger.addEventListener('click', () => {
            const isOpen = ui.overlay.classList.contains('active');
            if (isOpen) {
                // CLOSE
                ui.overlay.classList.remove('active');
                window.speechSynthesis.cancel();
                setTriggerState(false);
            } else {
                // OPEN
                ui.overlay.classList.add('active');
                if (ui.chatBox.children.length < 2) showRootMenu();
                setTriggerState(true);
            }
        });
    }
    
    // 2. CLOSE BUTTON (Syncs Trigger)
    if (ui.closeBtn) {
        ui.closeBtn.addEventListener('click', () => {
            ui.overlay.classList.remove('active');
            window.speechSynthesis.cancel();
            setTriggerState(false);
        });
    }

    // 3. INPUTS
    if (ui.sendBtn) ui.sendBtn.addEventListener('click', () => processQuery(ui.inputField.value));
    if (ui.inputField) ui.inputField.addEventListener('keypress', e => { if (e.key === 'Enter') processQuery(ui.inputField.value); });

    if (ui.speakerBtn) ui.speakerBtn.addEventListener('click', () => {
        SETTINGS.speechEnabled = !SETTINGS.speechEnabled;
        if (!SETTINGS.speechEnabled) window.speechSynthesis.cancel();
        ui.speakerBtn.innerHTML = SETTINGS.speechEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    });

    if (ui.micBtn && window.webkitSpeechRecognition) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SR();
        recognition.continuous = false;
        recognition.onstart = () => { isListening = true; ui.micBtn.classList.add('active'); ui.inputField.placeholder = "Listening..."; };
        recognition.onend = () => { isListening = false; ui.micBtn.classList.remove('active'); ui.inputField.placeholder = "Type message..."; };
        recognition.onresult = (e) => processQuery(e.results[0][0].transcript);
        ui.micBtn.addEventListener('click', () => {
            if (currentMode !== 'ai') return alert("Click AI Mode first");
            isListening ? recognition.stop() : recognition.start();
        });
    } else if(ui.micBtn) ui.micBtn.style.display = 'none';
}

init();