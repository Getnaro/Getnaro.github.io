/* =========================================================
   COMMUNITY CHAT - FINAL REVAMPED CODE
   - FIX: Reliable user presence write upon login.
   - FIX: Immediate local message display on successful send.
   - FIX: Correct HTML structure for new CSS layout.
========================================================= */

import { mainAuth, mainDb } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    ref, set, push, onChildAdded, onValue, onDisconnect, 
    query, limitToLast 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- DOM ELEMENTS ---
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const userListContainer = document.getElementById('user-list');
const mentionList = document.getElementById('mention-list');

let currentUser = null;
let usersCache = {}; 

// --- AUTH & USER PRESENCE (FIXED) ---
onAuthStateChanged(mainAuth, (user) => {
    if (user) {
        currentUser = user;
        const username = user.displayName || user.email.split('@')[0] || "Anonymous";
        
        const userStatusRef = ref(mainDb, `community/users/${user.uid}`);
        
        const presenceData = {
            username: username,
            status: 'online', 
            lastSeen: Date.now()
        };
        
        // FIX: Force the user's status to 'online' immediately upon load/login
        set(userStatusRef, presenceData)
            .then(() => {
                // Once presence is set, setup the disconnect hook and the chat
                onDisconnect(userStatusRef).remove();
                setupChat();
            })
            .catch(error => {
                console.error("Failed to set user presence:", error);
                // Continue to setup chat even if presence fails
                onDisconnect(userStatusRef).remove();
                setupChat();
            });

    } else {
        // Redirect if not logged in
        window.location.href = "/pages/login.html";
    }
});

function setupChat() {
    // --- 1. OPTIMIZED MESSAGES LOADING ---
    const messagesRef = ref(mainDb, 'community/messages');
    const recentMessagesQuery = query(messagesRef, limitToLast(50));
    
    onChildAdded(recentMessagesQuery, (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg);
    }, (error) => {
        console.error("Firebase Message Listener Failed:", error.message);
    });

    // --- 2. ACTIVE USERS ---
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

    // --- INPUT HANDLERS ---
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                sendMessage();
            }
        });
        messageInput.addEventListener('input', handleMentions);
    }
}

function sendMessage() {
    if (!messageInput) return;
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    const messagesRef = ref(mainDb, 'community/messages');
    const newMessageRef = push(messagesRef);
    
    const messageData = {
        sender: currentUser.displayName || currentUser.email.split('@')[0] || "Anonymous",
        senderUid: currentUser.uid,
        text: text,
        timestamp: Date.now()
    };
    
    set(newMessageRef, messageData)
        .then(() => {
            // FIX: Immediately display the message locally after successful write.
            displayMessage(messageData); 
            
            messageInput.value = '';
            if (mentionList) mentionList.style.display = 'none';
        })
        .catch(error => {
            console.error("Error sending message:", error);
            alert("Failed to send message. Please check connection and permissions.");
        });
}

function displayMessage(msg) {
    if (!chatMessages) return;
    
    const div = document.createElement('div');
    const isSelf = currentUser && msg.senderUid === currentUser.uid;
    div.className = `message ${isSelf ? 'self' : 'other'}`;

    let content = msg.text;
    const mentionRegex = /@(\w+)/g;
    const currentName = currentUser ? currentUser.displayName : "";

    // Highlight mentions
    content = content.replace(mentionRegex, (match, username) => {
        if (username === currentName) {
            return `<span class="mention-highlight">${match}</span>`;
        }
        return match; 
    });

    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // --- NEW HTML STRUCTURE FOR CSS LAYOUT ---
    div.innerHTML = `
        <div class="message-header">
            <span>${msg.sender}</span>
        </div>
        <div class="message-content-box">
            ${content}
            <span class="message-time">${time}</span>
        </div>
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
    messageInput.selectionStart = messageInput.selectionEnd = textBefore.length; 
    
    mentionList.style.display = 'none';
    messageInput.focus();
}