const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');

admin.database.enableLogging(true);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

// Initialize a reference to the Firebase Realtime Database
const database = admin.database();

const verifyToken = async (token) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error("Error verifying token:", error);
    return null;
  }
};

const createUserProfileIfNotExist = async (uid, userName) => {
  const userProfileRef = database.ref(`users/${uid}/profile`);
  const snapshot = await userProfileRef.once('value');
  if (!snapshot.exists()) {
    // Create profile for first-time users
    userProfileRef.set({
      userName: userName
    });
  }
};

const saveUserMessage = async (uid, studentCurrentQuestion, assistantMessage) => {
  const userMessagesRef = database.ref(`users/${uid}/messages`).push();
  await userMessagesRef.set({
    userMessage: studentCurrentQuestion,
    assistantMessage: assistantMessage,
    timestamp: Date.now()
  });
};

const registerUserToDatabase = async (uid, userName) => {
  await createUserProfileIfNotExist(uid, userName);
};

const getUserQuota = async (uid) => {
    const userQuotaRef = database.ref(`users/${uid}/quota`);
    const snapshot = await userQuotaRef.once('value');
    
    // If the quota doesn't exist for the user, it's 0 by default.
    return snapshot.val() || 0;
  };
  
  const incrementUserQuota = async (uid) => {
    const currentQuota = await getUserQuota(uid);
    const userQuotaRef = database.ref(`users/${uid}/quota`);
    
    // Increment the current quota by 1
    await userQuotaRef.set(currentQuota + 1);
  };

module.exports = {
  verifyToken,
  createUserProfileIfNotExist,
  saveUserMessage,
  registerUserToDatabase,
  getUserQuota,
  incrementUserQuota,
};
