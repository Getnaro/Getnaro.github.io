/* =========================================================
   COMMUNITY CHAT - OPTIMIZED PERFORMANCE
   - FAST LOAD: Limits chat history to last 50 messages
   - FIXED AUTH: Uses centralized login state
   - FIX: Immediate local message display on successful send.
========================================================= */

// NOTE: Ensure your firebase-config.js correctly exports mainAuth and mainDb.
import { mainAuth, mainDb } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    ref, set, push, onChildAdded, onValue, onDisconnect, 
    query, limitToLast // <--- USED FOR PERFORMANCE
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
onAuthStateChanged(mainAuth, (user) => {
    if (user) {
        currentUser = user;
        const username = user.displayName || user.email.split('@')[0] || "Anonymous User";
        
        // 1. Setup User Presence in RTDB
        const userStatusRef = ref(mainDb, `community/users/${user.uid}`);
        set(userStatusRef, {
            username: username,
            status: 'online',
            lastSeen: Date.now()
        });

        // Remove user from 'online' list when they close the page
        onDisconnect(userStatusRef).remove();
        
        // 2. Start Chat functionality
        setupChat();
    } else {
        // Redirect if not logged in
        console.warn("User not authenticated. Redirecting to login.");
        window.location.href = "/pages/login.html";
    }
});

function setupChat() {
    // --- 1. OPTIMIZED MESSAGES LOADING ---
    const messagesRef = ref(mainDb, 'community/messages');
    const recentMessagesQuery = query(messagesRef, limitToLast(50));
    
    // Listens for the last 50 messages initially, and then any new messages.
    onChildAdded(recentMessagesQuery, (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg);
    }, (error) => {
        // ERROR CHECKING: This will fire if 'community/messages' path is missing or permissions are wrong
        console.error("Firebase Message Listener Failed:", error.message);
        console.warn("ACTION REQUIRED: Check if the 'community' node exists in your Realtime Database!");
    });

    // --- 2. ACTIVE USERS ---
    const usersRef = ref(mainDb, 'community/users');
    onValue(usersRef, (snapshot) => {
        if (!userListContainer) return;
        userListContainer.innerHTML = '';
        usersCache = {}; // Reset cache

        let isOnline = false;
        
        snapshot.forEach((childSnapshot) => {
            const userData = childSnapshot.val();
            const uid = childSnapshot.key;
            usersCache[uid] = userData.username;
            
            if (currentUser && uid === currentUser.uid) {
                isOnline = true;
            }

            const li = document.createElement('li');
            // Added check for "online" status based on presence in the list
            li.innerHTML = `<div class="user-status"></div> ${userData.username}`;
            userListContainer.appendChild(li);
        });

        if (!isOnline && currentUser) {
            // Re-assert presence if for some reason the listener didn't catch the current user's entry
            console.log("Re-asserting user presence...");
            const userStatusRef = ref(mainDb, `community/users/${currentUser.uid}`);
            set(userStatusRef, {
                username: currentUser.displayName || currentUser.email.split('@')[0] || "Anonymous User",
                status: 'online',
                lastSeen: Date.now()
            });
        }
    });

    // --- INPUT HANDLERS ---
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevents default form submission if input is inside a form
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
    
    // 1. Write the message to the database
    set(newMessageRef, messageData)
        .then(() => {
            // 2. FIX: Immediately display the message locally after successful write.
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
    // Added a slight delay for smoother scrolling after rendering
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

    // Filter usersCache by username
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

    // Use absolute positioning relative to the input area to show the popup
    mentionList.style.display = matchCount > 0 ? 'block' : 'none';
}

function completeMention(username) {
    if (!messageInput || !mentionList) return;
    
    const val = messageInput.value;
    const cursorPos = messageInput.selectionStart;
    
    // Replaces the incomplete mention with the full username and a space
    const textBefore = val.slice(0, cursorPos).replace(/@(\w*)$/, `@${username} `);
    const textAfter = val.slice(cursorPos);
    
    messageInput.value = textBefore + textAfter;
    // Set cursor position after the completed mention for better UX
    messageInput.selectionStart = messageInput.selectionEnd = textBefore.length; 
    
    mentionList.style.display = 'none';
    messageInput.focus();
}