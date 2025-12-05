// /scripts/os_rendering.js (FINAL CORRECTED VERSION)

import { mainApp } from "/scripts/firebase-config.js";
import { getDatabase, ref as dbRef, get, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const rtdb = getDatabase(mainApp);
const containers = {
    windows: document.getElementById('os-windows-container'),
    linux: document.getElementById('os-linux-container'),
    android: document.getElementById('os-android-container')
};

// Initialize containers with loaders
Object.values(containers).forEach(c => {
    if (c) c.innerHTML = '<div class="gn-list-loader"><div class="gn-spinner"></div></div>';
});

// IMPORTANT: Define a global function for download stats to be callable from HTML onclick
window.recordOSDownload = function(osName) {
    const totalDlRef = dbRef(rtdb, "stats/total_downloads");
    runTransaction(totalDlRef, (current) => (current || 0) + 1);
    const safeName = osName.replace(/[.#$/\[\]]/g, "_");
    const osDlRef = dbRef(rtdb, `os_downloads/${safeName}`);
    runTransaction(osDlRef, (current) => (current || 0) + 1);
};


function renderOSItem(os, category) {
    const osId = os.id;
    const osName = os.name || 'Unknown OS';
    const osRelease = os.releaseDate || 'N/A';
    const imgSrc = os.image || '/assests/logo-getnaro-nobg.png';

    const card = document.createElement('div');
    card.className = 'os-list-item';
    card.dataset.osId = osId;
    card.dataset.category = category;

    // The download logic is corrected and linked to the global function
    card.innerHTML = `
        <img src="${imgSrc}" alt="${osName}" onerror="this.src='/assests/logo-getnaro-nobg.png'">
        <div class="os-list-details">
            <h4 class="${category}">${osName}</h4>
            <p>Release: ${osRelease}</p>
            <a  style="text-align: center; padding:15px; font-size:16px;" href="/pages/os_downloads.html?id=${osId}&cat=${category}" 
               onclick="recordOSDownload('${osName}')">
                VIEW & DOWNLOAD
            </a>
        </div>
    `;
    return card;
}


async function fetchAndRenderOS() {
    const osRef = dbRef(rtdb, "os_config/featured_os");

    try {
        const osSnapshot = await get(osRef);
        const allOSData = osSnapshot.val() || {};

        Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; }); 

        let totalOsCount = 0;

        Object.keys(containers).forEach(categoryKey => {
            const container = containers[categoryKey];
            const osItems = allOSData[categoryKey] || {};
            
            if (!container) return; // Skip if container doesn't exist

            if (Object.keys(osItems).length === 0) {
                 container.innerHTML = `<p style="color:#666; padding: 10px 0;">No ${categoryKey} systems currently featured.</p>`;
                 return;
            }

            Object.keys(osItems).forEach(osId => {
                const osData = osItems[osId];
                osData.id = osId; 
                container.appendChild(renderOSItem(osData, categoryKey));
                totalOsCount++;
            });
        });

        if (totalOsCount === 0) {
             Object.values(containers).forEach(c => {
                 if (c) c.innerHTML = `<p style="color:red; padding: 10px 0;">No OS entries found. Check RTDB path: os_config/featured_os/...</p>`;
             });
        }


    } catch (error) {
        console.error("Error fetching OS data from RTDB:", error);
        Object.values(containers).forEach(c => {
            if (c) c.innerHTML = `<p style="color:red; padding: 10px 0;">Failed to load OS data. Check console/RTDB rules.</p>`;
        });
    }
}

document.addEventListener('DOMContentLoaded', fetchAndRenderOS);