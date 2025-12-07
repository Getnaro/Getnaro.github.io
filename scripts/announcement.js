/**
 * MULTI-ANNOUNCEMENT SYSTEM (UPDATED)
 * /scripts/announcement.js
 * - Now supports multiple announcements
 * - Reads from announcements/{id} instead of site_config/announcement
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
                return `<img src="${block.url}" alt="Announcement" style="width:100%; border-radius:10px; margin: 15px 0; border:1px solid #333;">`;
            case 'button':
                return `<a href="${block.link}" target="_blank" style="
                    display: inline-block; background: ${block.color || '#9F00FF'}; color: white;
                    text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: bold;
                    margin-top: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">${block.text}</a>`;
            default: return '';
        }
    }).join('');
}

let currentAnnouncementData = null;

function showAnnouncementPopup(data) {
    // 1. Check if elements already exist
    if (document.getElementById('gn-announcement-overlay')) return;
    
    currentAnnouncementData = data;

    // --- A. THE FLOATING BAR ---
    const floatBar = document.createElement('div');
    floatBar.id = 'gn-announce-float';
    
    floatBar.style.cssText = `
        position: fixed; top: 30%; right: 20px; 
        background: #111; border: 1px solid #9F00FF; border-radius: 50px;
        padding: 10px 20px; display: flex; align-items: center; gap: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 99998; cursor: pointer;
        transform: translateX(150%); opacity: 0; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        max-width: 300px;
    `;
    floatBar.innerHTML = `
        <i class="fa-solid fa-bell" style="color: #9F00FF; animation: swing 2s infinite;"></i>
        <span style="color: #fff; font-size: 14px; font-weight: 600;">New Announcement</span>
        <i class="fa-solid fa-chevron-left" style="color: #666; font-size: 12px; margin-left: auto;"></i>
    `;
    
    floatBar.onclick = () => {
        const overlay = document.getElementById('gn-announcement-overlay');
        const box = overlay.querySelector('.gn-announce-box');
        
        floatBar.style.transform = 'translateX(150%)';
        floatBar.style.opacity = '0';
        
        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.style.opacity = '1';
            box.style.transform = 'translateY(0) scale(1)';
        }, 10);
    };

    document.body.appendChild(floatBar);

    // --- B. THE MAIN OVERLAY ---
    const overlay = document.createElement('div');
    overlay.id = 'gn-announcement-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(5px); z-index: 99999;
        display: flex; justify-content: center; align-items: center;
        opacity: 0; transition: opacity 0.3s ease;
    `;

    const box = document.createElement('div');
    box.className = 'gn-announce-box';
    box.style.cssText = `
        background: #111; border: 1px solid #333; border-top: 4px solid #9F00FF;
        border-radius: 16px; width: 90%; max-width: 550px;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5); transform: translateY(20px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
        max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = "padding: 20px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center;";
    header.innerHTML = `<span style="color:#9F00FF; font-weight:bold; letter-spacing:1px; text-transform:uppercase; display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-bullhorn"></i> ${data.title || 'Announcement'}</span>`;
    
    const closeX = document.createElement('button');
    closeX.innerHTML = '<i class="fa-solid fa-minus"></i>';
    closeX.title = "Minimize";
    closeX.style.cssText = "background:none; border:none; color:#666; font-size:18px; cursor:pointer; padding: 5px;";
    closeX.onclick = () => handleMinimize(data);
    header.appendChild(closeX);

    // Content Body
    const body = document.createElement('div');
    body.style.cssText = "padding: 30px; overflow-y: auto; text-align: center;";
    body.innerHTML = renderBlocks(data.content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = "background: #0a0a0a; border-top: 1px solid #222; padding: 20px; display: flex; flex-direction: column; gap: 15px;";

    const redBox = document.createElement('label');
    redBox.style.cssText = `
        display: flex; align-items: center; justify-content: center; gap: 10px;
        background: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.3);
        padding: 10px; border-radius: 8px; cursor: pointer; transition: 0.2s;
    `;
    redBox.innerHTML = `
        <input type="checkbox" id="gn-dont-show" style="accent-color: #ff2a2a; transform: scale(1.2);">
        <span style="color: #ffcccc; font-size: 14px; font-weight: 500;">Don't show this again</span>
    `;
    redBox.onmouseover = () => redBox.style.background = 'rgba(255, 0, 0, 0.15)';
    redBox.onmouseout = () => redBox.style.background = 'rgba(255, 0, 0, 0.1)';

    const actionBtn = document.createElement('button');
    actionBtn.innerHTML = `<i class="fa-solid fa-check"></i> OK, Got it`;
    actionBtn.style.cssText = `
        background: #222; color: #fff; border: 1px solid #444; 
        padding: 12px; width: 100%; border-radius: 8px; font-size: 15px; 
        font-weight: bold; cursor: pointer; transition: 0.2s;
    `;
    actionBtn.onmouseover = () => { actionBtn.style.background = '#333'; actionBtn.style.borderColor = '#666'; };
    actionBtn.onmouseout = () => { actionBtn.style.background = '#222'; actionBtn.style.borderColor = '#444'; };
    
    actionBtn.onclick = () => handleMinimize(data);

    footer.appendChild(redBox);
    footer.appendChild(actionBtn);

    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        box.style.transform = 'translateY(0) scale(1)';
    });
}

function handleMinimize(data) {
    const overlay = document.getElementById('gn-announcement-overlay');
    const box = overlay.querySelector('.gn-announce-box');
    const floatBar = document.getElementById('gn-announce-float');
    const dontShowCheckbox = document.getElementById('gn-dont-show');

    if (dontShowCheckbox && dontShowCheckbox.checked) {
        const storageKey = `gn_announce_${data.id}_${data.lastUpdated}`;
        localStorage.setItem(storageKey, 'true');
        
        overlay.style.opacity = '0';
        box.style.transform = 'translateY(20px) scale(0.9)';
        if (floatBar) floatBar.remove(); 
        setTimeout(() => overlay.remove(), 300);
        
    } else {
        overlay.style.opacity = '0';
        box.style.transform = 'translateY(50px) scale(0.8)';
        
        setTimeout(() => {
            overlay.style.display = 'none';
            
            if (floatBar) {
                floatBar.style.transform = 'translateX(0)';
                floatBar.style.opacity = '1';
            }
        }, 300);
    }
}

// ✅ UPDATED: Now reads from announcements/ instead of site_config/announcement
function checkAndShowAnnouncement() {
    const announcementsRef = ref(rtdb, 'announcements');
    
    onValue(announcementsRef, (snapshot) => {
        if (!snapshot.exists()) {
            console.log('📢 No announcements found in database');
            return;
        }
        
        const allAnnouncements = [];
        const data = snapshot.val();
        
        // Convert to array
        Object.keys(data).forEach(key => {
            allAnnouncements.push({ id: key, ...data[key] });
        });
        
        // Filter: Only enabled announcements
        const enabledAnnouncements = allAnnouncements.filter(a => a.enabled);
        
        if (enabledAnnouncements.length === 0) {
            console.log('📢 No enabled announcements');
            return;
        }
        
        const currentPage = getCurrentPageName();
        console.log('📍 Current page:', currentPage);
        
        // Filter: Match target pages
        const matchingAnnouncements = enabledAnnouncements.filter(announcement => {
            const targetPages = announcement.pages || [];
            
            // Empty array = show on all pages
            if (targetPages.length === 0) return true;
            
            // Check if current page is in target list
            return targetPages.includes(currentPage);
        });
        
        if (matchingAnnouncements.length === 0) {
            console.log('📢 No announcements for this page');
            return;
        }
        
        // Sort by lastUpdated (newest first)
        matchingAnnouncements.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
        
        // Show the most recent one
        const announcementToShow = matchingAnnouncements[0];
        
        const storageKey = `gn_announce_${announcementToShow.id}_${announcementToShow.lastUpdated}`;
        const hasSeen = localStorage.getItem(storageKey);
        
        if (announcementToShow.frequency === 'always' || !hasSeen) {
            console.log('✅ Showing announcement:', announcementToShow.title);
            showAnnouncementPopup(announcementToShow);
        } else {
            console.log('👁️ User has already seen this announcement');
        }
    });
}

// Add CSS keyframe for bell animation
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes swing {
    0% { transform: rotate(0deg); }
    10% { transform: rotate(10deg); }
    30% { transform: rotate(-10deg); }
    50% { transform: rotate(5deg); }
    70% { transform: rotate(-5deg); }
    100% { transform: rotate(0deg); }
}`;
document.head.appendChild(styleSheet);

document.addEventListener('DOMContentLoaded', checkAndShowAnnouncement);