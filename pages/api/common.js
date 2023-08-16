const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');

//admin.database.enableLogging(true);

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

const createUserProfileIfNotExist = async (uid, userName, userEmail) => {
  const userProfileRef = database.ref(`users/${uid}/profile`);
  const snapshot = await userProfileRef.once('value');
  if (!snapshot.exists()) {
    // Create profile for first-time users
    userProfileRef.set({
      userName: userName,
      userEmail: userEmail
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

const registerUserToDatabase = async (uid, userName, userEmail) => {
  await createUserProfileIfNotExist(uid, userName, userEmail);
};



const getMessagesTimestamps = async (uid) => {
  const quotaLimit = await fetchQuotaFromFirebase();
  const userMessagesRef = database.ref(`users/${uid}/messages`).orderByChild('timestamp').limitToLast(quotaLimit);
  const snapshot = await userMessagesRef.once('value');
  
  // Extract the timestamps from the snapshot and return them in ascending order
  const timestamps = [];
  snapshot.forEach(childSnapshot => {
    timestamps.push(childSnapshot.val().timestamp);
  });
  return timestamps.sort((a, b) => a - b);
};



const checkRateLimit = async (uid) => {
  const timestamps = await getMessagesTimestamps(uid);
  const quotaLimit = await fetchQuotaFromFirebase();
  const cooldownLimit = await fetchCooldownFromFirebase();

  if (timestamps.length >= quotaLimit) {
    const oldestMessageTime = timestamps[0];
    const currentTime = Date.now();
    const timeDifference = currentTime - oldestMessageTime;
    const cooldown = cooldownLimit * 60 * 1000; // 10 minutes in milliseconds

    if (timeDifference < cooldown) {
      const timeRemaining = Math.ceil((cooldown - timeDifference) / (60 * 1000)); // Convert milliseconds to minutes
      return {
        status: 429,
        error: {
          message: `You have reached your message quota. Please wait ${timeRemaining} minutes before sending another message.`
        }
      };
    }
  }
  return null;  // Return null if no rate limit error
};


const remoteConfig = admin.remoteConfig();
async function fetchKeywordsFromFirebase() {
  try {
      const config = await remoteConfig.getTemplate();
      const keywordsJson = JSON.parse(config.parameters.theory_of_computation_keywords.defaultValue.value);
      return keywordsJson.keywords;
  } catch (error) {
      console.error("Error fetching keywords from Firebase Remote Config:", error);
      return "";
  }
}

const MESSAGES_QNT = 40
async function fetchQuotaFromFirebase() {
  try {
      const config = await remoteConfig.getTemplate();
      const quotaLimit = parseInt(config.parameters.messages_quota_limit.defaultValue.value, 10);
      return quotaLimit;
  } catch (error) {
      console.error("Error fetching quotaLimit from Firebase Remote Config:", error);
      return MESSAGES_QNT;
  }
}

const COOLDOWN_TIME = 20 
async function fetchCooldownFromFirebase() {
  try {
      const config = await remoteConfig.getTemplate();
      const cooldownTime = parseInt(config.parameters.cooldown_time.defaultValue.value, 10);
      return cooldownTime;
  } catch (error) {
      console.error("Error fetching cooldownTime from Firebase Remote Config:", error);
      return COOLDOWN_TIME;
  }
}

async function fetchKeywordsRestrictionsFromFirebase() {
  try {
      const config = await remoteConfig.getTemplate();
      const allowKeywordsRestriction = config.parameters.allow_restrictions.defaultValue.value.toLowerCase() === 'true';
      return allowKeywordsRestriction;
  } catch (error) {
      console.error("Error fetching allowKeywordsRestriction from Firebase Remote Config:", error);
      return false;
  }
}



async function fetchMainPromptFromFirebase() {
  try {
      const config = await remoteConfig.getTemplate();
      const mainPrompt = JSON.parse(config.parameters.main_prompt.defaultValue.value);
      return mainPrompt.content;
  } catch (error) {
      console.error("Error fetching mainPrompt from Firebase Remote Config:", error);
      return "";
  }
}



module.exports = {
  verifyToken,
  createUserProfileIfNotExist,
  saveUserMessage,
  registerUserToDatabase,
  getMessagesTimestamps,
  checkRateLimit,
  fetchKeywordsFromFirebase,
  fetchKeywordsRestrictionsFromFirebase,
  fetchMainPromptFromFirebase,
};
