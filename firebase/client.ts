// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC17khqSie4uZ69U6k8RrPu0rZhAOFpn0g",
  authDomain: "ai-interview-mock-da418.firebaseapp.com",
  projectId: "ai-interview-mock-da418",
  storageBucket: "ai-interview-mock-da418.firebasestorage.app",
  messagingSenderId: "59278480366",
  appId: "1:59278480366:web:a225d2b6313f2ae7c8f4ff",
  measurementId: "G-PHGQWDYYZ3",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);