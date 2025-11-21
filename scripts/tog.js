// -----------------------------
// GLOBAL COLLECTION OF ALL APPS
// -----------------------------
let aiData = [];

// Collect every .content-one card into searchable AI data
document.querySelectorAll(".content-one").forEach(card => {
    const name = card.querySelector("h5")?.innerText.trim() || "";
    const img = card.querySelector("img")?.src || "";
    const category = card.dataset.category || "general";

    aiData.push({
        name,
        img,
        category,
        element: card,
        keywords: name.toLowerCase().split(" ")  // simple keyword extraction
    });
});

console.log("AI Loaded:", aiData.length);

// -----------------------------
// DOM ELEMENTS
// -----------------------------
const overlay = document.getElementById("gn-search-overlay");
const openBtn = document.getElementById("gn-search-btn");
const closeBtn = document.getElementById("gn-search-close");
const input = document.getElementById("gn-search-input");
const resultsBox = document.getElementById("gn-search-results");
const popup = document.querySelector(".popup"); // optional

// -----------------------------
// OPEN SEARCH OVERLAY
// -----------------------------
openBtn?.addEventListener("click", () => {
    if (popup) popup.style.display = "none"; // hide popup if open
    overlay.style.display = "flex";
    input.value = "";
    resultsBox.innerHTML = "";
    input.focus();
});

// -----------------------------
// CLOSE SEARCH OVERLAY
// -----------------------------
closeBtn?.addEventListener("click", () => {
    overlay.style.display = "none";
    input.value = "";
    resultsBox.innerHTML = "";
});

// -----------------------------
// AI SEARCH FUNCTION
// -----------------------------
function aiSearch(query) {
    const q = query.toLowerCase();
    let matches = [];

    aiData.forEach(app => {
        let score = 0;
        const name = app.name.toLowerCase();

        // Scores
        if (name.includes(q)) score += 10;         // strong match
        app.keywords.forEach(k => {                // keyword match
            if (k.includes(q)) score += 5;
        });
        if (app.category.includes(q)) score += 3;  // category match
        if (name[0] === q[0]) score += 1;          // fuzzy match

        if (score > 0) matches.push({ ...app, score });
    });

    // Sort by score
    return matches.sort((a, b) => b.score - a.score);
}

// -----------------------------
// INPUT LISTENER
// -----------------------------
input.addEventListener("input", () => {
    const query = input.value.trim();
    resultsBox.innerHTML = "";

    if (query.length === 0) return;

    const results = aiSearch(query);

    if (results.length === 0) {
        resultsBox.innerHTML =
            `<div class="no-result">No results found</div>`;
        return;
    }

    // Create result items
    results.forEach(app => {
        const item = document.createElement("div");
        item.classList.add("search-result-item");

        item.innerHTML = `
            <img src="${app.img}">
            <div class="search-info">
                <h4>${app.name}</h4>
                <p>${app.category.toUpperCase()} • Score ${app.score}</p>
            </div>
        `;

        // On click → show full card style
        item.onclick = () => showFullCard(app);
        resultsBox.appendChild(item);
    });
});

// -----------------------------
// SHOW ORIGINAL CARD IN OVERLAY
// -----------------------------
function showFullCard(app) {
    resultsBox.innerHTML = "";

    const original = app.element.cloneNode(true);
    original.style.transform = "scale(1.02)";
    original.style.background = "white";
    original.style.color = "black";
    original.style.padding = "20px";
    original.style.borderRadius = "12px";
    original.style.boxShadow = "0 0 25px rgba(0,0,0,0.20)";
    original.style.marginTop = "20px";

    resultsBox.appendChild(original);
}