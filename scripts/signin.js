// complete-signup.js - Handles both email signup with OTP and social authentication
// Place this as /scripts/complete-signup.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, FacebookAuthProvider, OAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtX1G_OEXmkKtBNGzWQFEYiEWibrMIFrg",
  authDomain: "user-getnaro.firebaseapp.com",
  databaseURL: "https://user-getnaro-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "user-getnaro",
  storageBucket: "user-getnaro.firebasestorage.app",
  messagingSenderId: "264425704576",
  appId: "1:264425704576:web:cfd98a1f627e9a59cc2a65"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const statusMsg = document.getElementById('status-msg');
const showMsg = (text, type) => {
    statusMsg.textContent = text;
    statusMsg.className = `status-msg ${type}`;
};

// ============================================
// SOCIAL AUTHENTICATION PROVIDERS
// ============================================

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
const facebookProvider = new FacebookAuthProvider();
const twitterProvider = new OAuthProvider('twitter.com');

// Save user to database (for social auth)
const saveUserToDB = async (user, additionalData = {}) => {
    await set(ref(db, 'users/' + user.uid), {
        name: user.displayName || additionalData.name || "User",
        email: user.email,
        username: additionalData.username || user.email.split('@')[0],
        phone: "Not Linked",
        joined: Date.now(),
        emailVerified: true,
        accountStatus: "active",
        authProvider: additionalData.provider || "social",
        photoURL: user.photoURL || null
    });
};

// Google Signup
document.getElementById('google-signup')?.addEventListener('click', async () => {
    try {
        showMsg("Signing up with Google...", "success");
        const result = await signInWithPopup(auth, googleProvider);
        await saveUserToDB(result.user, { provider: 'google' });
        showMsg("Account created successfully!", "success");
        setTimeout(() => window.location.href = '/index.html', 1500);
    } catch (error) {
        showMsg(error.message.replace("Firebase: ", ""), "error");
    }
});

// GitHub Signup
document.getElementById('github-signup')?.addEventListener('click', async () => {
    try {
        showMsg("Signing up with GitHub...", "success");
        const result = await signInWithPopup(auth, githubProvider);
        await saveUserToDB(result.user, { provider: 'github' });
        showMsg("Account created successfully!", "success");
        setTimeout(() => window.location.href = '/index.html', 1500);
    } catch (error) {
        showMsg(error.message.replace("Firebase: ", ""), "error");
    }
});

// Facebook Signup
document.getElementById('facebook-signup')?.addEventListener('click', async () => {
    try {
        showMsg("Signing up with Facebook...", "success");
        const result = await signInWithPopup(auth, facebookProvider);
        await saveUserToDB(result.user, { provider: 'facebook' });
        showMsg("Account created successfully!", "success");
        setTimeout(() => window.location.href = '/index.html', 1500);
    } catch (error) {
        showMsg(error.message.replace("Firebase: ", ""), "error");
    }
});

// Twitter/X Signup
document.getElementById('twitter-signup')?.addEventListener('click', async () => {
    try {
        showMsg("Signing up with X (Twitter)...", "success");
        const result = await signInWithPopup(auth, twitterProvider);
        await saveUserToDB(result.user, { provider: 'twitter' });
        showMsg("Account created successfully!", "success");
        setTimeout(() => window.location.href = '/index.html', 1500);
    } catch (error) {
        showMsg(error.message.replace("Firebase: ", ""), "error");
    }
});

// ============================================
// EMAIL SIGNUP WITH OTP VERIFICATION
// ============================================

// Generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP via Web3Forms
const sendOTPEmail = async (email, otp, name) => {
    try {
        const response = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                access_key: '7387db01-2899-4364-b0b9-330c8dcc74d1',
                subject: `Getnaro - Your Verification Code: ${otp}`,
                from_name: 'Getnaro',
                to: email,
                message: `Hello ${name},\n\nYour Getnaro verification code is:\n\n🔐 ${otp}\n\nThis code will expire in 5 minutes.\n\nIf you didn't request this code, please ignore this email.\n\nBest regards,\nGetnaro Team`
            })
        });
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
};

// Show OTP verification modal
const showOTPModal = (email, correctOTP, userData) => {
    const modal = document.createElement('div');
    modal.id = 'otp-modal';
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <i class="fa-solid fa-shield-halved" style="font-size: 48px; color: #9F00FF;"></i>
                    <h2>Verify Your Email</h2>
                </div>
                <div class="modal-body">
                    <p>We've sent a 6-digit verification code to:</p>
                    <p style="font-weight: bold; color: #9F00FF; margin: 10px 0;">${email}</p>
                    <p style="margin-bottom: 20px;">Enter the code below to complete your registration.</p>
                    
                    <div class="otp-input-container">
                        <input type="text" maxlength="1" class="otp-digit" data-index="0">
                        <input type="text" maxlength="1" class="otp-digit" data-index="1">
                        <input type="text" maxlength="1" class="otp-digit" data-index="2">
                        <input type="text" maxlength="1" class="otp-digit" data-index="3">
                        <input type="text" maxlength="1" class="otp-digit" data-index="4">
                        <input type="text" maxlength="1" class="otp-digit" data-index="5">
                    </div>
                    
                    <div id="otp-error" class="otp-error" style="display: none;"></div>
                    
                    <div class="otp-timer">
                        <i class="fa-solid fa-clock"></i>
                        <span id="timer">Code expires in <strong>5:00</strong></span>
                    </div>
                    
                    <div class="otp-help">
                        <i class="fa-solid fa-circle-info"></i>
                        <span>Check your email inbox. Code may take 1-2 minutes to arrive.</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="resend-otp" class="gn-btn-secondary" disabled>
                        <i class="fa-solid fa-rotate-right"></i> Resend OTP
                    </button>
                    <button id="verify-otp" class="gn-btn-primary">
                        <i class="fa-solid fa-check"></i> Verify
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Add styles (same as before)
    const style = document.createElement('style');
    style.textContent = `
        #otp-modal .modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.85); display: flex;
            align-items: center; justify-content: center; z-index: 10000;
            backdrop-filter: blur(8px);
        }
        #otp-modal .modal-content {
            background: var(--box, #1a1a1a); border: 2px solid #9F00FF;
            border-radius: 16px; padding: 35px; max-width: 500px; width: 90%;
            box-shadow: 0 15px 50px rgba(159, 0, 255, 0.4);
            animation: bounceIn 0.5s ease;
        }
        @keyframes bounceIn {
            0% { transform: scale(0.3); opacity: 0; }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); opacity: 1; }
        }
        #otp-modal .modal-header { text-align: center; margin-bottom: 25px; }
        #otp-modal .modal-header h2 { margin-top: 15px; color: var(--text, #fff); font-size: 24px; }
        #otp-modal .modal-body { text-align: center; color: var(--text, #ccc); }
        #otp-modal .otp-input-container { display: flex; gap: 10px; justify-content: center; margin: 25px 0; }
        #otp-modal .otp-digit {
            width: 50px; height: 60px; text-align: center; font-size: 24px; font-weight: bold;
            border: 2px solid #9F00FF; border-radius: 10px;
            background: rgba(159, 0, 255, 0.05); color: var(--text, #fff);
            transition: all 0.3s;
        }
        #otp-modal .otp-digit:focus {
            outline: none; border-color: #9F00FF;
            background: rgba(159, 0, 255, 0.15); transform: scale(1.1);
            box-shadow: 0 0 20px rgba(159, 0, 255, 0.5);
        }
        #otp-modal .otp-error {
            background: rgba(255, 68, 68, 0.1); border: 1px solid #ff4444;
            color: #ff4444; padding: 12px; border-radius: 8px;
            margin: 15px 0; font-weight: 500;
        }
        #otp-modal .otp-timer, #otp-modal .otp-help {
            background: rgba(159, 0, 255, 0.1); border: 1px solid #9F00FF;
            border-radius: 8px; padding: 12px; margin-top: 15px;
            display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        #otp-modal .otp-help {
            background: rgba(33, 150, 243, 0.1); border-color: #2196F3;
            font-size: 13px; text-align: left;
        }
        #otp-modal .otp-timer i { color: #9F00FF; font-size: 18px; }
        #otp-modal .otp-help i { color: #2196F3; font-size: 16px; flex-shrink: 0; }
        #otp-modal .modal-footer { display: flex; gap: 10px; justify-content: center; margin-top: 25px; }
        #otp-modal .gn-btn-primary, #otp-modal .gn-btn-secondary {
            padding: 12px 24px; border: none; border-radius: 8px;
            cursor: pointer; font-weight: 600; transition: all 0.3s;
            display: flex; align-items: center; gap: 8px;
        }
        #otp-modal .gn-btn-primary { background: #9F00FF; color: white; }
        #otp-modal .gn-btn-primary:hover { background: #8000CC; transform: translateY(-2px); }
        #otp-modal .gn-btn-secondary {
            background: transparent; border: 2px solid #666; color: #666;
        }
        #otp-modal .gn-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        #otp-modal .gn-btn-secondary:not(:disabled):hover {
            background: rgba(159, 0, 255, 0.1); border-color: #9F00FF; color: #9F00FF;
        }
    `;
    document.head.appendChild(style);

    // OTP input handling
    const otpInputs = modal.querySelectorAll('.otp-digit');
    const otpError = modal.querySelector('#otp-error');

    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
            if (!/^\d$/.test(value)) e.target.value = '';
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').slice(0, 6);
            pastedData.split('').forEach((char, i) => {
                if (otpInputs[i]) otpInputs[i].value = char;
            });
            otpInputs[Math.min(pastedData.length, 5)].focus();
        });
    });

    // Timer countdown
    let timeLeft = 300;
    const timerElement = modal.querySelector('#timer strong');
    const resendBtn = modal.querySelector('#resend-otp');
    
    const countdown = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerElement.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(countdown);
            timerElement.parentElement.innerHTML = '<span style="color: #ff4444;">OTP Expired</span>';
            resendBtn.disabled = false;
        }
        
        if (timeLeft <= 60) resendBtn.disabled = false;
    }, 1000);

    // Verify OTP
    modal.querySelector('#verify-otp').addEventListener('click', async () => {
        const enteredOTP = Array.from(otpInputs).map(input => input.value).join('');
        
        if (enteredOTP.length !== 6) {
            otpError.textContent = 'Please enter all 6 digits';
            otpError.style.display = 'block';
            return;
        }

        if (enteredOTP === correctOTP) {
            const verifyBtn = modal.querySelector('#verify-otp');
            verifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
            verifyBtn.disabled = true;

            try {
                await set(ref(db, 'users/' + userData.uid), {
                    username: userData.username,
                    email: userData.email,
                    name: userData.name,
                    phone: "Not Linked",
                    joined: Date.now(),
                    emailVerified: true,
                    accountStatus: "active",
                    authProvider: "email"
                });

                verifyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Verified!';
                verifyBtn.style.background = '#00ff00';
                clearInterval(countdown);
                showMsg("Email Verified Successfully!", "success");
                
                setTimeout(() => {
                    modal.remove();
                    window.location.href = '/index.html';
                }, 1500);
            } catch (error) {
                otpError.textContent = 'Verification failed. Please try again.';
                otpError.style.display = 'block';
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Verify';
            }
        } else {
            otpError.textContent = 'Invalid OTP. Please check and try again.';
            otpError.style.display = 'block';
            otpInputs.forEach(input => {
                input.value = '';
                input.style.borderColor = '#ff4444';
                setTimeout(() => input.style.borderColor = '#9F00FF', 1000);
            });
            otpInputs[0].focus();
        }
    });

    // Resend OTP
    resendBtn.addEventListener('click', async () => {
        const newOTP = generateOTP();
        resendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        resendBtn.disabled = true;
        
        const sent = await sendOTPEmail(userData.email, newOTP, userData.name);
        
        if (sent) {
            correctOTP = newOTP;
            timeLeft = 300;
            console.log('New OTP:', newOTP);
            otpError.textContent = 'New OTP sent to your email!';
            otpError.style.background = 'rgba(0, 255, 0, 0.1)';
            otpError.style.borderColor = '#00ff00';
            otpError.style.color = '#00ff00';
            otpError.style.display = 'block';
            setTimeout(() => {
                otpError.style.display = 'none';
                resendBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Resend OTP';
            }, 3000);
        }
    });

    otpInputs[0].focus();
};

// Email Signup Handler
document.getElementById('btn-signup')?.addEventListener('click', async () => {
    const name = document.getElementById('s-name').value.trim();
    const username = document.getElementById('s-username').value.trim();
    const email = document.getElementById('s-email').value.trim();
    const pass = document.getElementById('s-pass').value;
    const confirmPass = document.getElementById('s-confirm-pass').value;
    const terms = document.getElementById('check-terms').checked;
    const captcha = document.getElementById('check-captcha').checked;

    if(!name || !username || !email || !pass) return showMsg("Please fill all fields", "error");
    if(pass !== confirmPass) return showMsg("Passwords do not match", "error");
    if(pass.length < 6) return showMsg("Password must be at least 6 characters", "error");
    if(!terms) return showMsg("You must agree to Terms & Conditions", "error");
    if(!captcha) return showMsg("Please verify you are human", "error");

    try {
        showMsg("Creating Account...", "success");
        
        const otp = generateOTP();
        console.log('🔐 OTP:', otp);
        
        showMsg("Sending verification code...", "success");
        const emailSent = await sendOTPEmail(email, otp, name);
        
        if (emailSent) {
            console.log('✅ Email sent');
        } else {
            console.warn('⚠️ Email failed - check console for OTP');
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });

        const userData = {
            uid: user.uid,
            username: username,
            email: email,
            name: name
        };

        showMsg("Account created! Verify your email now.", "success");
        setTimeout(() => showOTPModal(email, otp, userData), 500);

    } catch (error) {
        let errorMsg = error.message.replace("Firebase: ", "");
        if (error.code === 'auth/email-already-in-use') {
            errorMsg = "Email already registered. Please login.";
        } else if (error.code === 'auth/weak-password') {
            errorMsg = "Password too weak. Use at least 6 characters.";
        }
        showMsg(errorMsg, "error");
    }
});
import { mainAuth, mainDb, mainFirestore, mainStorage } from './firebase-config.js';