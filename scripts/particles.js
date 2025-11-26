document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("gn-particles");
    const ctx = canvas.getContext("2d");

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // FORCE density based on screen size (much better)
    const PARTICLES = Math.floor((window.innerWidth * window.innerHeight) / 12000);
    // Example: 1920x1080 → ~172 particles

    console.log("Particles generated:", PARTICLES);

    const dots = [];
    for (let i = 0; i < PARTICLES; i++) {
        dots.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 2 + 1,
            dx: (Math.random() - 0.5) * 0.5,
            dy: (Math.random() - 0.5) * 0.5
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "rgba(255,255,255,0.35)";

        dots.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();

            p.x += p.dx;
            p.y += p.dy;

            // wrap around edges
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;
        });

        requestAnimationFrame(draw);
    }

    draw();
});
import { mainAuth, mainDb, mainFirestore, mainStorage } from './firebase-config.js';