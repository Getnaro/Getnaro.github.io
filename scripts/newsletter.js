// /scripts/newsletter.js

// Using Firebase Compat Libraries (as required by original logic)
import "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js";
import "https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js";

// Initialize Firebase (using compat version for better compatibility)
const firebaseConfig = {
    apiKey: "AIzaSyCtX1G_OEXmkKtBNGzWQFEYiEWibrMIFrg",
    authDomain: "user-getnaro.firebaseapp.com",
    databaseURL: "https://user-getnaro-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "user-getnaro",
    storageBucket: "user-getnaro.firebasestorage.app",
    messagingSenderId: "264425704576",
    appId: "1:264425704576:web:cfd98a1f627e9a59cc2a65"
};

// Initialize only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized');
}

const database = firebase.database();
console.log('✅ Database ready');

// Custom Popup Function
window.showSubscribePopup = function(message, isSuccess = true) {
    // ... (Popup creation logic remains the same) ...
    const existingPopup = document.querySelector('.gn-subscribe-popup');
    if (existingPopup) existingPopup.remove();
    
    const popup = document.createElement('div');
    popup.className = 'gn-subscribe-popup';
    popup.innerHTML = `
        <div class="gn-subscribe-box">
            <div class="popup-icon">
                ${isSuccess 
                    ? '<i class="fa-solid fa-circle-check"></i>' 
                    : '<i class="fa-solid fa-circle-exclamation"></i>'}
            </div>
            <h3>${isSuccess ? 'Successfully Subscribed!' : 'Oops!'}</h3>
            <p>${message}</p>
            <button class="popup-close-btn" onclick="this.closest('.gn-subscribe-popup').remove()">
                ${isSuccess ? 'Awesome!' : 'Got It'}
            </button>
        </div>
    `;
    
    document.body.appendChild(popup);
    setTimeout(() => popup.classList.add('show'), 10);
    
    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => popup.remove(), 300);
    }, 4000);
};

// Newsletter Form Listener
document.addEventListener('DOMContentLoaded', function() {
    const newsletterForm = document.querySelector('.newsletter-form');
    
    if (!newsletterForm) {
        console.warn('⚠️ Newsletter form not found');
        return;
    }
    
    console.log('✅ Newsletter form found');
    
    newsletterForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('📝 Form submitted');
        
        const input = newsletterForm.querySelector('.newsletter-input');
        const btn = newsletterForm.querySelector('.newsletter-btn');
        const email = input.value.trim().toLowerCase();
        
        // Validation
        if (!email) {
            showSubscribePopup('Please enter a valid email address.', false);
            return;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showSubscribePopup('Please enter a valid email format.', false);
            return;
        }
        
        // Visual Feedback
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subscribing...';
        btn.disabled = true;
        
        try {
            console.log('🔄 Processing subscription...');
            
            const encodedEmail = email.replace(/\./g, ',');
            const subscriberRef = database.ref('newsletter_subscribers/' + encodedEmail);
            
            console.log('📡 Checking if already subscribed...');
            
            subscriberRef.once('value', function(snapshot) {
                if (snapshot.exists()) {
                    console.log('✅ Already subscribed');
                    showSubscribePopup('You\'re already on our list! 🎉', false);
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                } else {
                    console.log('💾 Saving new subscriber...');
                    
                    subscriberRef.set({
                        email: email,
                        name: email.split('@')[0],
                        subscribedAt: Date.now(),
                        source: 'store_page',
                        status: 'active'
                    }).then(function() {
                        console.log('✅ Successfully subscribed!');
                        showSubscribePopup('Welcome to Getnaro! You\'ll receive updates on new apps, exclusive features, and more.', true);
                        input.value = "";
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }).catch(function(error) {
                        console.error('❌ Save Error:', error);
                        showSubscribePopup('Something went wrong. Please try again later.', false);
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    });
                }
            }, function(error) {
                console.error('❌ Check Error:', error);
                showSubscribePopup('Something went wrong. Please try again later.', false);
                btn.innerHTML = originalText;
                btn.disabled = false;
            });
            
        } catch (error) {
            console.error('❌ Subscribe Error:', error);
            showSubscribePopup('Something went wrong. Please try again later.', false);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
    
    console.log('✅ Newsletter system ready');
});