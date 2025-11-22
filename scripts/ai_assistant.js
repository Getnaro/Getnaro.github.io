// --- CONFIGURATION ---
const FAQ_DB = {
    "what is getnaro": "Getnaro is your all-in-one hub for downloading verified Windows software.",
    "is it safe": "Yes! All files are scanned for viruses.",
    "contact support": "Email support@getnaro.com."
};

// WEB LINKS
const APP_KEYWORDS = {
    "amd": { name: "AMD Software", url: "/downloads/amd-driver.html" },
    "asrock": { name: "ASRock Downloads", url: "/downloads/asrock-downloads.html" },
    "pro": { name: "AMD Pro Edition", url: "/downloads/amd-pro.html" },
    "nvidia": { name: "NVIDIA Drivers", url: "/downloads/nvidia-drivers.html" },
    "intel": { name: "Intel DSA", url: "/downloads/intel-dsa.html" }
};

// MANUAL MODE DATA TREE
const MANUAL_MENU = {
    "root": {
        text: "How can I help you today?",
        options: [
            { label: "🤖 AI Assistant", action: "set_mode_ai" },
            { label: "📂 Manual Selection", action: "goto_manual_cat" }
        ]
    },
    "manual_cat": {
        text: "Select a category:",
        options: [
            { label: "💾 Drivers", action: "goto_drivers" },
            { label: "🛠️ Utilities", action: "goto_utils" },
            { label: "👤 Account Help", action: "goto_account" },
            { label: "⬅️ Back", action: "goto_root" }
        ]
    },
    "drivers": {
        text: "Which driver do you need?",
        options: [
            { label: "AMD Adrenalin", url: "/downloads/amd-driver.html" },
            { label: "AMD Pro", url: "/downloads/amd-pro.html" },
            { label: "ASRock", url: "/downloads/asrock-downloads.html" },
            { label: "⬅️ Back", action: "goto_manual_cat" }
        ]
    },
    "utils": {
        text: "Useful Tools:",
        options: [
            { label: "DirectX", url: "#" }, 
            { label: "C++ Runtimes", url: "#" },
            { label: "⬅️ Back", action: "goto_manual_cat" }
        ]
    },
    "account": {
        text: "Account Options:",
        options: [
            { label: "Login", url: "/pages/login.html" },
            { label: "Sign Up", url: "/pages/signup.html" },
            { label: "My Profile", url: "/pages/profile.html" },
            { label: "⬅️ Back", action: "goto_manual_cat" }
        ]
    }
};

// --- DOM ELEMENTS ---
const trigger = document.getElementById('gn-ai-trigger');
const overlay = document.getElementById('gn-ai-overlay');
const closeBtn = document.getElementById('gn-ai-close');
const chatBox = document.getElementById('gn-ai-chat');
const inputField = document.getElementById('gn-ai-input');
const sendBtn = document.getElementById('btn-send');
const micBtn = document.getElementById('btn-mic');
const speakerBtn = document.getElementById('btn-speaker');
const inputArea = document.querySelector('.gn-ai-input-area');

// --- STATE ---
let isSpeakingEnabled = true;
let currentMode = 'menu'; 

// --- 1. TOGGLE UI ---
if (trigger && overlay && closeBtn) {
    trigger.addEventListener('click', () => {
        overlay.classList.add('active');
        if (chatBox.children.length <= 1) {
            initChat();
        }
    });
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
}

// --- 2. INITIALIZATION ---
function initChat() {
    chatBox.innerHTML = ''; 
    showMenu("root");
}

function showMenu(menuKey) {
    currentMode = 'manual'; 
    disableInput(true); 

    const data = MANUAL_MENU[menuKey] || MANUAL_MENU["root"];
    
    addMessage(data.text, 'bot');

    // Create Options Container
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'msg bot gn-ai-options'; // Use new class instead of inline styles

    data.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.className = 'gn-ai-option-btn'; // Use new class
        btn.onclick = () => handleMenuSelection(opt);
        optionsDiv.appendChild(btn);
    });

    chatBox.appendChild(optionsDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function handleMenuSelection(option) {
    addMessage(option.label, 'user');

    if (option.action === "set_mode_ai") {
        currentMode = 'ai';
        disableInput(false);
        addMessage("AI Mode Activated. You can type or speak now!", 'bot');
        return;
    }

    if (option.action && option.action.startsWith("goto_")) {
        const nextKey = option.action.replace("goto_", "");
        setTimeout(() => showMenu(nextKey), 500);
        return;
    }

    if (option.url) {
        addMessage(`Navigating to <b>${option.label}</b>...`, 'bot');
        setTimeout(() => window.location.href = option.url, 1000);
    }
}

function disableInput(disable) {
    if (inputArea) {
        inputArea.style.display = disable ? 'none' : 'flex';
    }
}

// --- 3. INTELLIGENCE (Fuzzy Search) ---
function getSimilarity(s1, s2) {
    let longer = s1; let shorter = s2;
    if (s1.length < s2.length) { longer = s2; shorter = s1; }
    let longerLength = longer.length;
    if (longerLength == 0) { return 1.0; }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}
function editDistance(s1, s2) {
    s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
    let costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}
function findBestMatch(inputWord) {
    let bestMatch = null; let highestScore = 0;
    for (let key in APP_KEYWORDS) {
        let score = getSimilarity(inputWord, key);
        if (score > highestScore) { highestScore = score; bestMatch = APP_KEYWORDS[key]; }
    }
    return highestScore > 0.6 ? bestMatch : null;
}

// --- 4. CHAT LOGIC ---
function addMessage(text, sender) {
    if (!chatBox) return;
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerHTML = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (sender === 'bot' && isSpeakingEnabled && currentMode === 'ai') {
        speak(text.replace(/<[^>]*>?/gm, '')); 
    }
}

function processQuery(query) {
    if (currentMode !== 'ai') return;

    query = query.toLowerCase().trim();
    if (!query) return;

    addMessage(query, 'user');
    if (inputField) inputField.value = '';

    if (query.includes("install") || query.includes("download") || query.includes("get")) {
        const words = query.split(" ");
        let foundApp = null;
        for (let word of words) {
            if (APP_KEYWORDS[word]) { foundApp = APP_KEYWORDS[word]; break; }
            let fuzzy = findBestMatch(word);
            if (fuzzy) { foundApp = fuzzy; break; }
        }
        if (foundApp) {
            addMessage(`Found it! Opening <b>${foundApp.name}</b>...`, 'bot');
            setTimeout(() => window.location.href = foundApp.url, 1500);
            return;
        }
    }

    if (query.includes("home")) { window.location.href = "/index.html"; return; }
    if (query.includes("login")) { window.location.href = "/pages/login.html"; return; }
    if (query.includes("profile")) { window.location.href = "/pages/profile.html"; return; }

    let bestMatch = "";
    for (let q in FAQ_DB) {
        if (query.includes(q)) bestMatch = FAQ_DB[q];
    }
    if (bestMatch) { addMessage(bestMatch, 'bot'); return; }

    addMessage("I didn't quite catch that. Try asking 'Install AMD' or switch to Manual Mode by reloading.", 'bot');
}

// --- 5. EVENT LISTENERS ---
if (sendBtn) sendBtn.addEventListener('click', () => processQuery(inputField.value));
if (inputField) {
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processQuery(inputField.value);
    });
}

// --- 6. SPEECH ---
if (micBtn) {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.onstart = () => { micBtn.classList.add('active'); inputField.placeholder = "Listening..."; };
        recognition.onend = () => { micBtn.classList.remove('active'); inputField.placeholder = "Type a message..."; };
        recognition.onresult = (event) => { processQuery(event.results[0][0].transcript); };
        micBtn.addEventListener('click', () => {
            if (currentMode !== 'ai') {
                alert("Switch to AI Mode first!");
                return;
            }
            recognition.start();
        });
    } else {
        micBtn.style.display = 'none';
    }
}

function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
}

if (speakerBtn) {
    speakerBtn.addEventListener('click', () => {
        isSpeakingEnabled = !isSpeakingEnabled;
        speakerBtn.classList.toggle('speak-active', isSpeakingEnabled);
        speakerBtn.innerHTML = isSpeakingEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    });
}