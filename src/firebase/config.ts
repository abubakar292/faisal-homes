import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            "AIzaSyBuYD1FY4D09OaTueWOEKu4Clo34KzMWQk",
  authDomain:        "faisal-homes.firebaseapp.com",
  projectId:         "faisal-homes",
  storageBucket:     "faisal-homes.firebasestorage.app",
  messagingSenderId: "125295421888",
  appId:             "1:125295421888:web:7aa237a5de07ac55bac025",
};

const app = initializeApp(firebaseConfig);

export const auth          = getAuth(app);
export const db            = getFirestore(app);
export const storage       = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
