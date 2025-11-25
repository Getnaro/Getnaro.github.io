   const toggleBtn = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");

    // Load saved theme
    let currentTheme = localStorage.getItem("theme") || "dark";
    applyTheme(currentTheme);

    toggleBtn.addEventListener("click", () => {
        currentTheme = currentTheme === "dark" ? "light" : "dark";
        applyTheme(currentTheme);
        localStorage.setItem("theme", currentTheme);
    });

    function applyTheme(mode) {
        if (mode === "light") {
            document.body.classList.remove("dark-mode");
            document.body.classList.add("light-mode");
            themeIcon.classList.replace("fa-moon", "fa-sun");
        } else {
            document.body.classList.remove("light-mode");
            document.body.classList.add("dark-mode");
            themeIcon.classList.replace("fa-sun", "fa-moon");
        }
    }