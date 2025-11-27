/**
 * ADVANCED ANNOUNCEMENT SYSTEM
 * /scripts/announcement.js
 */

import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

const firebaseConfig = {
    apiKey: "AIzaSyCtX1G_OEXmkKtBNGzWQFEYiEWibrMIFrg",
    authDomain: "user-getnaro.firebaseapp.com",
    databaseURL: "https://user-getnaro-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "user-getnaro",
    storageBucket: "user-getnaro.firebasestorage.app",
    messagingSenderId: "264425704576",
    appId: "1:264425704576:web:cfd98a1f627e9a59cc2a65"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const rtdb = getDatabase(app);

function getCurrentPageName() {
    const path = window.location.pathname;
    return path.split('/').pop().replace('.html', '') || 'index';
}

// --- CONTENT RENDERER ---
function renderBlocks(blocks) {
    if (!blocks || !Array.isArray(blocks)) return '<p>No content available.</p>';
    
    return blocks.map(block => {
        switch(block.type) {
            case 'heading':
                return `<h2 style="color: ${block.color || '#fff'}; font-size: 24px; font-weight: bold; margin: 15px 0 10px 0;">${block.content}</h2>`;
            
            case 'paragraph':
                return `<p style="color: #ccc; font-size: 16px; line-height: 1.6; margin-bottom: 15px;">${block.content}</p>`;
            
            case 'list-item':
                return `<div style="display:flex; gap:10px; margin-bottom:8px; align-items:start; text-align:left;">
                    <i class="fa-solid fa-check" style="color:#00e676; margin-top:5px;"></i>
                    <span style="color:#ddd; font-size:15px;">${block.content}</span>
                </div>`;
            
            case 'image':
                return `<img src="${block.url}" alt="Announcement Image" style="width:100%; border-radius:10px; margin: 15px 0; border:1px solid #333;">`;
            
            case 'button':
                return `<a href="${block.link}" target="_blank" style="
                    display: inline-block;
                    background: ${block.color || '#9F00FF'};
                    color: white;
                    text-decoration: none;
                    padding: 12px 30px;
                    border-radius: 8px;
                    font-weight: bold;
                    margin-top: 15px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">${block.text}</a>`;
            
            default: return '';
        }
    }).join('');
}

function showAnnouncementPopup(data) {
    // Prevent duplicates
    if (document.getElementById('gn-announcement-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'gn-announcement-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(8px); z-index: 99999;
        display: flex; justify-content: center; align-items: center;
        opacity: 0; transition: opacity 0.3s ease;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: #111; border: 1px solid #333; border-top: 4px solid #9F00FF;
        border-radius: 16px; padding: 0; max-width: 550px; width: 90%;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5); transform: translateY(20px);
        transition: transform 0.3s ease; max-height: 85vh; display: flex; flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = "padding: 20px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center;";
    header.innerHTML = `<span style="color:#9F00FF; font-weight:bold; letter-spacing:1px; text-transform:uppercase;"><i class="fa-solid fa-bell"></i> Announcement</span>`;
    
    // Close X button
    const closeX = document.createElement('button');
    closeX.innerHTML = '&times;';
    closeX.style.cssText = "background:none; border:none; color:#666; font-size:24px; cursor:pointer;";
    closeX.onclick = () => closePopup(overlay);
    header.appendChild(closeX);

    // Content Body (Scrollable)
    const body = document.createElement('div');
    body.style.cssText = "padding: 30px; overflow-y: auto; text-align: center;";
    body.innerHTML = renderBlocks(data.content); // Use the new renderer

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = "padding: 20px; border-top: 1px solid #222; text-align: center; background: #0a0a0a; border-radius: 0 0 16px 16px;";
    
    const dismissBtn = document.createElement('button');
    dismissBtn.innerText = "Close";
    dismissBtn.style.cssText = "background: #222; color: #fff; border: 1px solid #333; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-weight: bold;";
    dismissBtn.onclick = () => closePopup(overlay);
    
    footer.appendChild(dismissBtn);

    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Trigger Animation
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        box.style.transform = 'translateY(0)';
    });
}

function closePopup(overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
}

function checkAndShowAnnouncement() {
    const announcementRef = ref(rtdb, 'site_config/announcement');
    
    onValue(announcementRef, (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.enabled || !data.content || data.content.length === 0) return;
        
        const currentPage = getCurrentPageName();
        const targetPages = data.pages || [];
        const shouldShow = targetPages.length === 0 || targetPages.includes(currentPage);
        
        if (shouldShow) {
            const storageKey = `gn_announce_${data.lastUpdated}`; // Use timestamp to force new announcements
            const hasSeen = localStorage.getItem(storageKey);
            
            // "once" = show only if not in localstorage
            // "always" = show every time (session check usually preferred, but simple always here)
            if (data.frequency === 'always' || !hasSeen) {
                showAnnouncementPopup(data);
                localStorage.setItem(storageKey, 'true');
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', checkAndShowAnnouncement);