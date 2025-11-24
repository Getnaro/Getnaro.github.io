    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
    import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
    import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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

    const statusMsg = document.getElementById('status-msg');
    const showMsg = (text, type) => {
        statusMsg.textContent = text;
        statusMsg.className = `status-msg ${type}`;
    };

    document.getElementById('btn-signup').addEventListener('click', async () => {
        const name = document.getElementById('s-name').value.trim();
        const username = document.getElementById('s-username').value.trim();
        const email = document.getElementById('s-email').value.trim();
        const pass = document.getElementById('s-pass').value;
        const confirmPass = document.getElementById('s-confirm-pass').value;
        const terms = document.getElementById('check-terms').checked;
        const captcha = document.getElementById('check-captcha').checked;

        // Validation
        if(!name || !username || !email || !pass) return showMsg("Please fill all fields", "error");
        if(pass !== confirmPass) return showMsg("Passwords do not match", "error");
        if(!terms) return showMsg("You must agree to Terms & Conditions", "error");
        if(!captcha) return showMsg("Please verify you are human", "error");

        try {
            showMsg("Creating Account...", "success");
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            // Update Profile Name
            await updateProfile(user, { displayName: name });

            // Save to DB
            await set(ref(db, 'users/' + user.uid), {
                username: username,
                email: email,
                name: name,
                phone: "Not Linked",
                joined: Date.now()
            });

            showMsg("Account Created Successfully!", "success");
            setTimeout(() => window.location.href = '/index.html', 1500);

        } catch (error) {
            showMsg(error.message.replace("Firebase: ", ""), "error");
        }
    });