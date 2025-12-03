/* =========================================================
   COMMUNITY CHAT - FIXED AUTH
   - Uses centralized firebase-config.js to share login state
   - Matches SDK versions (11.6.1)
========================================================= */

// 1. Import from your central config (This shares the login session)
import { mainAuth, mainDb } from './firebase-config.js';

// 2. Import specific functions from the matching SDK version (11.6.1)
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    ref, set, push, onChildAdded, onValue, onDisconnect 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- DOM ELEMENTS ---
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const userListContainer = document.getElementById('user-list');
const mentionList = document.getElementById('mention-list');

let currentUser = null;
let usersCache = {}; 

// --- AUTH & USER PRESENCE ---
// We use 'mainAuth' here, so it remembers you are already logged in
onAuthStateChanged(mainAuth, (user) => {
    if (user) {
        currentUser = user;
        const username = user.displayName || "Anonymous";
        
        // Use 'mainDb' for database interactions
        const userStatusRef = ref(mainDb, `community/users/${user.uid}`);
        set(userStatusRef, {
            username: username,
            status: 'online',
            lastSeen: Date.now()
        });

        onDisconnect(userStatusRef).remove();
        setupChat();
    } else {
        // Only redirect if actually not logged in
        window.location.href = "/pages/login.html";
    }
});

function setupChat() {
    // --- MESSAGES ---
    const messagesRef = ref(mainDb, 'community/messages');
    
    onChildAdded(messagesRef, (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg);
    });

    // --- ACTIVE USERS ---
    const usersRef = ref(mainDb, 'community/users');
    onValue(usersRef, (snapshot) => {
        if (!userListContainer) return;
        userListContainer.innerHTML = '';
        usersCache = {};
        
        snapshot.forEach((childSnapshot) => {
            const userData = childSnapshot.val();
            const uid = childSnapshot.key;
            usersCache[uid] = userData.username;

            const li = document.createElement('li');
            li.innerHTML = `<div class="user-status"></div> ${userData.username}`;
            userListContainer.appendChild(li);
        });
    });

    // --- SEND ---
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        // --- MENTION ---
        messageInput.addEventListener('input', handleMentions);
    }
}

function sendMessage() {
    if (!messageInput) return;
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    const messagesRef = ref(mainDb, 'community/messages');
    const newMessageRef = push(messagesRef);
    
    set(newMessageRef, {
        sender: currentUser.displayName || "Anonymous",
        senderUid: currentUser.uid,
        text: text,
        timestamp: Date.now()
    });

    messageInput.value = '';
    if (mentionList) mentionList.style.display = 'none';
    scrollToBottom(); 
}

function displayMessage(msg) {
    if (!chatMessages) return;
    
    const div = document.createElement('div');
    const isSelf = currentUser && msg.senderUid === currentUser.uid;
    div.className = `message ${isSelf ? 'self' : 'other'}`;

    let content = msg.text;
    const mentionRegex = /@(\w+)/g;
    
    // Safely handle display name
    const currentName = currentUser ? currentUser.displayName : "";

    content = content.replace(mentionRegex, (match, username) => {
        if (username === currentName) {
            return `<span class="mention-highlight">${match}</span>`;
        }
        return match; 
    });

    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="message-header">
            <span>${msg.sender}</span>
            <span>${time}</span>
        </div>
        <div class="message-content">${content}</div>
    `;

    chatMessages.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    if (!chatMessages) return;
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
}

// --- MENTION LOGIC ---
function handleMentions(e) {
    if (!mentionList) return;
    
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    const lastWordMatch = val.slice(0, cursorPos).match(/@(\w*)$/);
    
    if (lastWordMatch) {
        const query = lastWordMatch[1].toLowerCase();
        showMentionPopup(query);
    } else {
        mentionList.style.display = 'none';
    }
}

function showMentionPopup(query) {
    if (!mentionList) return;
    
    mentionList.innerHTML = '';
    let matchCount = 0;

    Object.values(usersCache).forEach(username => {
        if (username.toLowerCase().startsWith(query)) {
            const div = document.createElement('div');
            div.className = 'mention-item';
            div.textContent = username;
            div.onclick = () => completeMention(username);
            mentionList.appendChild(div);
            matchCount++;
        }
    });

    mentionList.style.display = matchCount > 0 ? 'block' : 'none';
}

function completeMention(username) {
    if (!messageInput || !mentionList) return;
    
    const val = messageInput.value;
    const cursorPos = messageInput.selectionStart;
    
    const textBefore = val.slice(0, cursorPos).replace(/@(\w*)$/, `@${username} `);
    const textAfter = val.slice(cursorPos);
    
    messageInput.value = textBefore + textAfter;
    mentionList.style.display = 'none';
    messageInput.focus();
}