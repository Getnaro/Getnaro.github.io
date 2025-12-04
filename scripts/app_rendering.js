// /scripts/app_rendering.js

import { mainApp } from "/scripts/firebase-config.js";
import { getFirestore, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDatabase, ref as dbRef, set, get } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const db = getFirestore(mainApp);
const rtdb = getDatabase(mainApp);
const container = document.getElementById('apps-container');
const hotContainer = document.getElementById('hot-apps-container');

let allApps = []; 

// Helper function to format the date
function formatUpdateDate(dateString) {
    if (!dateString) return 'No Date';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
        return 'Invalid Date';
    }
}

// Function defined in the global scope so it can be called by DOMContentLoaded
async function fetchAndRenderApps() {
    // Show loaders immediately
    if(container) container.innerHTML = '<div class="gn-grid-loader"><div class="gn-spinner"></div></div>';
    if(hotContainer) hotContainer.innerHTML = '<div class="gn-grid-loader"><div class="gn-spinner"></div></div>';

    try {
        // --- 1. Fetch all App Data from Firestore ---
        const appsQuery = query(collection(db, "apps")); 
        const appsSnapshot = await getDocs(appsQuery);
        
        allApps = [];
        appsSnapshot.forEach((doc) => {
            allApps.push({ id: doc.id, ...doc.data() });
        });
        
        if (allApps.length === 0) {
            container.innerHTML = '<p style="text-align:center; width:100%; color: #aaa;">Maintenance Mode or No Apps Found.</p>';
            hotContainer.innerHTML = '<p style="width:100%; text-align:center; color:#666;">No recent updates.</p>';
            return;
        }

        // --- 2. Fetch Featured App IDs from RTDB Site Config ---
        const configRef = dbRef(rtdb, "site_config/featuredApps");
        const configSnapshot = await get(configRef);
        const featuredAppsConfig = configSnapshot.val() || { hot: [], updated: [] };
        
        const featuredHotIds = new Set(featuredAppsConfig.hot || []);
        const featuredUpdatedIds = new Set(featuredAppsConfig.updated || []);

        // --- 3. Render Grids ---
        container.innerHTML = ''; 
        allApps.sort((a, b) => a.name.localeCompare(b.name));
        
        hotContainer.innerHTML = '';
        let hotAppsFound = 0;
        
        // Stats update
        set(dbRef(rtdb, "stats/total_apps"), allApps.length);

        allApps.forEach(app => {
            const imgSrc = app.image || '/assests/logo-getnaro-nobg.png';
            const category = (app.category || 'tools').toLowerCase();
            const appDocId = app.id || app._id; 
            
            // Determine Badge
            let badgeHTML = '';
            if (featuredHotIds.has(appDocId)) {
                 badgeHTML = `<span class="gn-badge badge-hot">HOT</span>`;
            } else if (featuredUpdatedIds.has(appDocId)) {
                 badgeHTML = `<span class="gn-badge badge-updated">UPDATED</span>`;
            }
            
            const updateDate = formatUpdateDate(app.lastUpdated);
            const metaInfo = `v${app.version || '1.0'} • ${updateDate}`;

            const cardHTML = `
                <div class="content-one" data-category="${category}">
                    ${badgeHTML} 
                    <img src="${imgSrc}" alt="${app.name}" onerror="this.src='/assests/logo-getnaro-nobg.png'">
                    <span class="tet">
                        <h5>${app.name}</h5>
                        <span class="app-meta">${metaInfo}</span>
                        <a href="/pages/view.html?id=${appDocId}">DOWNLOAD</a>
                    </span>
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', cardHTML);
            
            if (badgeHTML !== '') {
                hotContainer.insertAdjacentHTML('beforeend', cardHTML);
                hotAppsFound++;
            }
        });

        if (hotAppsFound === 0) {
            hotContainer.innerHTML = '<p style="width:100%; text-align:center; color:#666;">No apps are currently featured.</p>';
        }

        // Initialize filtering logic
        initTabs();

    } catch (error) {
        console.error("Error fetching apps or config:", error);
        const errorMsg = `<p style="text-align:center; width:100%; color: red;">Failed to load apps.<br><small>${error.message}</small></p>`;
        container.innerHTML = errorMsg;
        hotContainer.innerHTML = errorMsg;
    }
}

// Global exposure for DOMContentLoaded
document.addEventListener('DOMContentLoaded', fetchAndRenderApps);

// Expose allApps for other modules like search.js
export { allApps }; 

// Tab initialization and filtering logic (extracted from original inline script)
function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    const dropdown = document.getElementById("mobile-category-dropdown");
    
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const category = tab.dataset.category;
            updateActiveState(category);
            filterContent(category);
        });
    });

    if(dropdown) {
        dropdown.addEventListener("change", (e) => {
            const category = e.target.value;
            updateActiveState(category);
            filterContent(category);
        });
    }

    function updateActiveState(category) {
        tabs.forEach(t => {
            if(t.dataset.category === category) t.classList.add("active");
            else t.classList.remove("active");
        });
        if(dropdown) dropdown.value = category;
    }
}

function filterContent(category) {
    const items = document.querySelectorAll("#apps-container .content-one");
    const container = document.getElementById('apps-container');

    if (category === "all") {
        container.classList.remove("filtered");
        items.forEach(item => {
            item.style.display = "flex"; 
        });
    } else {
        container.classList.add("filtered");
        items.forEach(item => {
            const itemCat = item.getAttribute('data-category');
            if (itemCat && itemCat.includes(category)) {
                item.style.display = "flex"; 
            } else {
                item.style.display = "none"; 
            }
        });
    }
}