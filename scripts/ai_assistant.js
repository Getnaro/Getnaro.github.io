/**
 * GETNARO AI ASSISTANT
 * /scripts/ai_assistant.js
 */

import { mainApp, mainFirestore } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const WORKER_URL = "https://getnaro-ai.narotech.workers.dev/"; 

const SETTINGS = {
    speechEnabled: true,     
    navDelay: 1000,          
    localPath: "/pages/view.html?id="
};

const SITE_CONTEXT = `
IDENTITY: You are the Getnaro Assistant.
WEBSITE: www.getnaro.com.
MISSION: Safe, ad-free, direct downloads.
INSTRUCTIONS:
- If user asks for an app, match it with the DB.
- If user confirms, I will handle the redirect.
`;

let APP_DB = [
  { id: "amd_driver", name: "AMD Driver", category: "drivers", tags: ["amd", "gpu"] }
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

async function fetchAppsFromDB() {
    try {
        const querySnapshot = await getDocs(collection(mainFirestore, "apps"));
        const dynamicApps = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            dynamicApps.push({
                id: doc.id,
                name: data.name,
                category: data.category || 'tools',
                tags: data.tags || [],
                description: data.description || ''
            });
        });
        if (dynamicApps.length > 0) APP_DB = dynamicApps;
    } catch (e) {
        console.error("AI Assistant: Failed to fetch apps from DB.", e);
    }
}

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

function getAppUrl(app) {
    if (app.url) return app.url; 
    return SETTINGS.localPath + app.id;
}

function navigateTo(url, label) {
    addMessage(`Opening <b>${label}</b>...`, 'bot');
    speak(`Opening ${label}`);
    setTimeout(() => { window.location.href = url; }, SETTINGS.navDelay);
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

function createBtn(parent, label, onClickFunction) {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.className = 'gn-ai-option-btn';
    btn.type = "button"; 
    btn.onclick = function() { onClickFunction(); };
    parent.appendChild(btn);
}

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
    cats.forEach(cat => { createBtn(div, `📂 ${cat.toUpperCase()}`, () => showApps(cat)); });
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

async function processQuery(rawQuery) {
    if (currentMode !== 'ai') return;
    const query = rawQuery.toLowerCase().trim();
    if (!query) return;

    addMessage(rawQuery, 'user');
    if (ui.inputField) ui.inputField.value = '';

    const confirmWords = ["yes", "sure", "install", "download", "do it", "go ahead"];
    if (lastSuggestedApp && confirmWords.some(w => query.includes(w))) {
        navigateTo(getAppUrl(lastSuggestedApp), lastSuggestedApp.name);
        lastSuggestedApp = null;
        return;
    }

    let foundApp = APP_DB.find(app => query.includes(app.name.toLowerCase())) ||
                   APP_DB.find(app => app.tags.some(tag => query.includes(tag)));

    if (foundApp && (query.includes('download') || query.includes('install') || query.includes('get'))) {
        navigateTo(getAppUrl(foundApp), foundApp.name);
        return;
    }

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

function speak(text) {
    if (!SETTINGS.speechEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    window.speechSynthesis.speak(u);
}

function init() {
    fetchAppsFromDB();
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

    if (ui.trigger) {
        ui.trigger.addEventListener('click', () => {
            const isOpen = ui.overlay.classList.contains('active');
            if (isOpen) {
                ui.overlay.classList.remove('active');
                window.speechSynthesis.cancel();
                setTriggerState(false);
            } else {
                ui.overlay.classList.add('active');
                if (ui.chatBox.children.length < 2) showRootMenu();
                setTriggerState(true);
            }
        });
    }
    
    if (ui.closeBtn) {
        ui.closeBtn.addEventListener('click', () => {
            ui.overlay.classList.remove('active');
            window.speechSynthesis.cancel();
            setTriggerState(false);
        });
    }

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