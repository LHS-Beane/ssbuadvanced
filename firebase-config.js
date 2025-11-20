// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDaPLXAplrJ2LR8rU4_3SEP_Jxkzhtf75E",
  authDomain: "ssbu-6a352.firebaseapp.com",
  databaseURL: "https://ssbu-6a352-default-rtdb.firebaseio.com",
  projectId: "ssbu-6a352",
  storageBucket: "ssbu-6a352.firebasestorage.app",
  messagingSenderId: "326500420876",
  appId: "1:326500420876:web:f2b1e0f045a133ca628d29"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
