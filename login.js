/* ==========================================================
   Firebase Modular Setup
========================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } 
    from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getDatabase, set, ref } 
    from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* Your Firebase Configuration */
const firebaseConfig = {
    apiKey: "AIzaSyAJrJnSQI7X1YJHLOfHZkknmoAoiOiGuEo",
    authDomain: "getnaroapp.firebaseapp.com",
    databaseURL: "https://getnaroapp-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "getnaroapp",
    storageBucket: "getnaroapp.firebasestorage.app",
    messagingSenderId: "304744138530",
    appId: "1:304744138530:web:8166344d61cdfa127ec77b",
    measurementId: "G-FLBX24J98C"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ==========================================================
   UI ELEMENTS
========================================================== */
const flipInner = document.querySelector(".flip-inner");
const toSignup = document.getElementById("to-signup");
const toLogin = document.getElementById("to-login");

const signupBtn = document.getElementById("signup-btn");
const loginBtn = document.getElementById("login-btn");

const panelTitle = document.getElementById("panel-title");
const panelDesc = document.getElementById("panel-desc");

/* ==========================================================
   FLIP SYSTEM
========================================================== */
toSignup.addEventListener("click", () => {
    flipInner.classList.add("flipped");
    panelTitle.textContent = "Create Account";
    panelDesc.textContent = "Join the Getnaro community";
});

toLogin.addEventListener("click", () => {
    flipInner.classList.remove("flipped");
    panelTitle.textContent = "Login";
    panelDesc.textContent = "Access your Getnaro account";
});

/* ==========================================================
   PASSWORD REVEAL
========================================================== */
function toggleEye(inputId, eyeId) {
    const input = document.getElementById(inputId);
    const eye = document.getElementById(eyeId);

    eye.addEventListener("click", () => {
        const type = input.type === "password" ? "text" : "password";
        input.type = type;
        eye.classList.toggle("fa-eye-slash");
    });
}

toggleEye("signup-password", "signup-eye");
toggleEye("login-password", "login-eye");

/* ==========================================================
   SIGNUP PROCESS
========================================================== */
signupBtn.addEventListener("click", async () => {
    const username = document.getElementById("signup-username").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    const age = document.getElementById("signup-age").value;
    const gender = document.getElementById("signup-gender").value;
    const pref = document.getElementById("signup-preference").value;

    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCred.user.uid;

        await set(ref(db, "users/" + uid), {
            username,
            email,
            age,
            gender,
            preference: pref,
            createdAt: Date.now()
        });

        alert("Account created successfully!");
        flipInner.classList.remove("flipped");

    } catch (err) {
        alert("Signup Error: " + err.message);
    }
});

/* ==========================================================
   LOGIN PROCESS
========================================================== */
loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Login successful!");

        window.location.href = "index.html"; // REDIRECT

    } catch (err) {
        alert("Login Error: " + err.message);
    }
});

/* ==========================================================
   ANIMATED PARTICLE BACKGROUND
========================================================== */
const canvas = document.getElementById("bg-canvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

let particles = [];
for (let i = 0; i < 50; i++) {
    particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 3 + 1,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3
    });
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "#9F00FF";
        ctx.fill();

        p.x += p.dx;
        p.y += p.dy;

        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    }

    requestAnimationFrame(animateParticles);
}
animateParticles();
