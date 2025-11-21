import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getDatabase, ref, update, onValue 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { 
  getAuth, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* Your Config */
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
const db = getDatabase(app);
const auth = getAuth(app);

/* When logged in → load install states */
onAuthStateChanged(auth, user => {
    if (!user) return;

    const appsRef = ref(db, "users/" + user.uid + "/apps");

    onValue(appsRef, snapshot => {
        const data = snapshot.val() || {};

        document.querySelectorAll(".content-one").forEach(box => {
            const appId = box.dataset.app;
            if (!appId) return;

            const dl = box.querySelector(".gn-btn-download");
            const up = box.querySelector(".gn-btn-update");
            const un = box.querySelector(".gn-btn-uninstall");

            if (data[appId]?.downloaded) {
                dl.style.display = "none";
                up.style.display = "block";
                un.style.display = "block";
            }
        });
    });
});