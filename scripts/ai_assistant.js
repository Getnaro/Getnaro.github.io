// --- CONFIGURATION ---
const FAQ_DB = {
    "what is getnaro": "Getnaro is your all-in-one hub for downloading verified Windows software, drivers, and tools safely.",
    "is it safe": "Yes! All files are scanned for viruses and threats before being listed.",
    "how to download": "Simply search for an app, click the card, and hit the Download button.",
    "create account": "Go to the Account page and sign up to track your downloads and sync history.",
    "forgot password": "You can reset your password on the Login page using your email.",
    "contact support": "You can reach us via the Contact page or email support@getnaro.com."
};

// UPDATED REDIRECTION LINKS TO /downloads/
const APP_KEYWORDS = {
    "amd": { name: "AMD Software", url: "/downloads/amd-driver.html" },
    "asrock": { name: "ASRock Downloads", url: "/downloads/asrock-downloads.html" },
    "pro": { name: "AMD Pro Edition", url: "/downloads/amd-pro.html" },
    "driver": { name: "Drivers Section", url: "/index.html" },
    "nvidia": { name: "NVIDIA Drivers", url: "/downloads/nvidia-drivers.html" }, // Example
    "intel": { name: "Intel DSA", url: "/downloads/intel-dsa.html" } // Example
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

// --- STATE ---
let isSpeakingEnabled = true;
let recognition;

// --- 1. TOGGLE UI ---
if (trigger && overlay && closeBtn) {
    trigger.addEventListener('click', () => overlay.classList.add('active'));
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
}

// --- 2. INTELLIGENCE: FUZZY SEARCH (TYPO FIXER) ---
// Calculates similarity between two words (Levenshtein Distance)
function getSimilarity(s1, s2) {
    let longer = s1;
    let shorter = s2;
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

// Finds best match for a word in our keywords
function findBestMatch(inputWord) {
    let bestMatch = null;
    let highestScore = 0;

    for (let key in APP_KEYWORDS) {
        let score = getSimilarity(inputWord, key);
        if (score > highestScore) {
            highestScore = score;
            bestMatch = APP_KEYWORDS[key];
        }
    }
    
    // Only return if similarity is > 60% to avoid random guessing
    return highestScore > 0.6 ? bestMatch : null;
}

// --- 3. CHAT LOGIC ---
function addMessage(text, sender) {
    if (!chatBox) return;
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerHTML = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (sender === 'bot' && isSpeakingEnabled) {
        speak(text.replace(/<[^>]*>?/gm, '')); 
    }
}

function processQuery(query) {
    query = query.toLowerCase().trim();
    if (!query) return;

    addMessage(query, 'user');
    if (inputField) inputField.value = '';

    // -- AI RULES ENGINE --
    
    // 1. Install/Download Commands (With Intelligent Matching)
    if (query.includes("install") || query.includes("download") || query.includes("get")) {
        // Split query into words to check each for a match
        const words = query.split(" ");
        let foundApp = null;

        for (let word of words) {
            // Check exact match first, then fuzzy match
            if (APP_KEYWORDS[word]) {
                foundApp = APP_KEYWORDS[word];
                break;
            }
            let fuzzy = findBestMatch(word);
            if (fuzzy) {
                foundApp = fuzzy;
                break;
            }
        }

        if (foundApp) {
            addMessage(`Found it! Opening <b>${foundApp.name}</b> for you...`, 'bot');
            setTimeout(() => window.location.href = foundApp.url, 1500);
            return;
        } else {
            addMessage("I couldn't identify the app. Try asking 'Install AMD' or 'Get ASRock'.", 'bot');
            return;
        }
    }

    // 2. Direct Navigation
    if (query.includes("home")) { window.location.href = "/index.html"; return; }
    if (query.includes("login") || query.includes("sign in")) { window.location.href = "/pages/login.html"; return; }
    if (query.includes("profile") || query.includes("account")) { window.location.href = "/pages/profile.html"; return; }

    // 3. FAQ Search
    let bestMatch = "";
    for (let q in FAQ_DB) {
        if (query.includes(q)) bestMatch = FAQ_DB[q];
    }

    if (bestMatch) {
        addMessage(bestMatch, 'bot');
        return;
    }

    // 4. Default Fallback
    const fallbacks = [
        "I can help you install apps, navigate the site, or answer questions about Getnaro.",
        "Try asking 'Is it safe?' or 'How to download'.",
        "I didn't quite catch that. Could you rephrase?"
    ];
    addMessage(fallbacks[Math.floor(Math.random() * fallbacks.length)], 'bot');
}

// --- 4. EVENT LISTENERS ---
if (sendBtn) sendBtn.addEventListener('click', () => processQuery(inputField.value));
if (inputField) {
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processQuery(inputField.value);
    });
}

// --- 5. SPEECH RECOGNITION (HEAR) ---
if (micBtn) {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            micBtn.classList.add('active');
            inputField.placeholder = "Listening...";
        };

        recognition.onend = () => {
            micBtn.classList.remove('active');
            inputField.placeholder = "Type a message...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            processQuery(transcript);
        };

        micBtn.addEventListener('click', () => recognition.start());
    } else {
        micBtn.style.display = 'none';
    }
}

// --- 6. SPEECH SYNTHESIS (SPEAK) ---
function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.pitch = 1;
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