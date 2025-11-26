import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, set, push, onChildAdded, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyCtX1G_OEXmkKtBNGzWQFEYiEWibrMIFrg",
  authDomain: "user-getnaro.firebaseapp.com",
  databaseURL: "https://user-getnaro-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "user-getnaro",
  storageBucket: "user-getnaro.firebasestorage.app",
  messagingSenderId: "264425704576",
  appId: "1:264425704576:web:cfd98a1f627e9a59cc2a65"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- DOM ELEMENTS ---
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const userListContainer = document.getElementById('user-list');
const mentionList = document.getElementById('mention-list');

let currentUser = null;
let usersCache = {}; 

// --- AUTH & USER PRESENCE ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const username = user.displayName || "Anonymous";
        
        const userStatusRef = ref(db, `community/users/${user.uid}`);
        set(userStatusRef, {
            username: username,
            status: 'online',
            lastSeen: Date.now()
        });

        onDisconnect(userStatusRef).remove();
        setupChat();
    } else {
        window.location.href = "/pages/login.html";
    }
});

function setupChat() {
    // --- MESSAGES ---
    const messagesRef = ref(db, 'community/messages');
    
    onChildAdded(messagesRef, (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg);
    });

    // --- ACTIVE USERS ---
    const usersRef = ref(db, 'community/users');
    onValue(usersRef, (snapshot) => {
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
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // --- MENTION ---
    messageInput.addEventListener('input', handleMentions);
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    const messagesRef = ref(db, 'community/messages');
    const newMessageRef = push(messagesRef);
    
    set(newMessageRef, {
        sender: currentUser.displayName || "Anonymous",
        senderUid: currentUser.uid,
        text: text,
        timestamp: Date.now()
    });

    messageInput.value = '';
    mentionList.style.display = 'none';
    scrollToBottom(); // Immediate scroll on send
}

function displayMessage(msg) {
    const div = document.createElement('div');
    const isSelf = msg.senderUid === currentUser.uid;
    div.className = `message ${isSelf ? 'self' : 'other'}`;

    let content = msg.text;
    const mentionRegex = /@(\w+)/g;
    content = content.replace(mentionRegex, (match, username) => {
        if (username === currentUser.displayName) {
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
    // Small timeout allows DOM to render the new message height before scrolling
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
}

// --- MENTION LOGIC ---
function handleMentions(e) {
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
    const val = messageInput.value;
    const cursorPos = messageInput.selectionStart;
    
    const textBefore = val.slice(0, cursorPos).replace(/@(\w*)$/, `@${username} `);
    const textAfter = val.slice(cursorPos);
    
    messageInput.value = textBefore + textAfter;
    mentionList.style.display = 'none';
    messageInput.focus();
}
import { mainAuth, mainDb, mainFirestore, mainStorage } from './firebase-config.js';