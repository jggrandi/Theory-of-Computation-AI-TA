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

const saveMessage = async (uid, role, content) => {
  const messagesRef = database.ref(`users/${uid}/messages`).push();
  await messagesRef.set({
    role: role,
    content: content,
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


let cacheStore = {
  quota: {
    data: null,
    lastFetch: null
  },
  cooldown: {
    data: null,
    lastFetch: null
  },
  mainPrompt: {
    data: null,
    lastFetch: null
  },
  gptModel:{
    data: null,
    lastFetch: null
  }
};

const BASE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

//To avoid fetching the remote variables at the same time and cause delays in the respose
function getRandomizedFetchInterval() {
  const RANDOMIZATION = (Math.random() - 0.5) * 2 * 2 * 5 * 1000; // random value between -5 and +5 minutes in milliseconds
  return BASE_INTERVAL + RANDOMIZATION;
}

const remoteConfig = admin.remoteConfig();

const MESSAGES_QNT = 10

async function fetchQuotaFromFirebase() {
  const currentTime = Date.now();

  if (cacheStore.quota.data && (currentTime - cacheStore.quota.lastFetch < getRandomizedFetchInterval())) {
    return cacheStore.quota.data;
  }

  try {
    const config = await remoteConfig.getTemplate();
    const quotaLimit = parseInt(config.parameters.messages_quota_limit.defaultValue.value, 10);
    cacheStore.quota = {
      data: quotaLimit,
      lastFetch: currentTime
    };
    return cacheStore.quota.data;
  } catch (error) {
    console.error("Error fetching quotaLimit from Firebase Remote Config:", error);
    return MESSAGES_QNT;
  }
}

const COOLDOWN_TIME = 20 

async function fetchCooldownFromFirebase() {
  const currentTime = Date.now();

  if (cacheStore.cooldown.data && (currentTime - cacheStore.cooldown.lastFetch < getRandomizedFetchInterval())) {
    return cacheStore.cooldown.data;
  }

  try {
    const config = await remoteConfig.getTemplate();
    const cooldownTime = parseInt(config.parameters.cooldown_time.defaultValue.value, 10);
    cacheStore.cooldown = {
      data: cooldownTime,
      lastFetch: currentTime
    };
    return cacheStore.cooldown.data;
  } catch (error) {
    console.error("Error fetching cooldownTime from Firebase Remote Config:", error);
    return COOLDOWN_TIME;
  }
}

async function fetchMainPromptFromFirebase() {
  const currentTime = Date.now();

  if (cacheStore.mainPrompt.data && (currentTime - cacheStore.mainPrompt.lastFetch < getRandomizedFetchInterval())) {
    return cacheStore.mainPrompt.data;
  }

  try {
    const config = await remoteConfig.getTemplate();
    const mainPrompt = JSON.parse(config.parameters.main_prompt.defaultValue.value);
    cacheStore.mainPrompt = {
      data: mainPrompt.content,
      lastFetch: currentTime
    };
    return cacheStore.mainPrompt.data;
  } catch (error) {
    console.error("Error fetching mainPrompt from Firebase Remote Config:", error);
    return "";
  }
}

const DEFAULT_GPT_MODEL = "gpt-3.5-turbo"

async function fetchGPTModelFromFirebase() {
  const currentTime = Date.now();

  if (cacheStore.gptModel.data && (currentTime - cacheStore.gptModel.lastFetch < getRandomizedFetchInterval())) {    
    return cacheStore.gptModel.data;
  }

  try {
    const config = await remoteConfig.getTemplate();
    const gptModel = config.parameters.gpt_model.defaultValue.value;

    cacheStore.gptModel = {
      data: gptModel,
      lastFetch: currentTime
    };
    return cacheStore.gptModel.data;
  } catch (error) {
    console.error("Error fetching gptModel from Firebase Remote Config:", error);
    return DEFAULT_GPT_MODEL;
  }
}



function validateMessageLength(studentCurrentQuestion) {
  //const studentCurrentQuestion = req.body.message;

  if (!studentCurrentQuestion) {
      return "Please enter a question before submitting.";
  }
  
  const greetingsPattern = /\b(hi|hello|hey)\b/i;
  if (studentCurrentQuestion.length < 5 && !greetingsPattern.test(studentCurrentQuestion)) {
    return "Your message is too short, try to be more descriptive so I can better help you.";
  }

  if (studentCurrentQuestion.length > 200) {
      return "Your message exceeds the 200 character limit.";
  }

  return null;
}

const updateLastClearedTimestamp = async (uid, timestamp) => {
  const userRef = database.ref(`users/${uid}`);
  await userRef.update({
    lastClearedTimestamp: timestamp
  });
};

const getLastClearedTimestamp = async (uid) => {
  const userRef = database.ref(`users/${uid}`);
  const snapshot = await userRef.once('value');

  return snapshot.val().lastClearedTimestamp || null;
};

const getStoredMessages = async ({ uid, limitToLast = 20, minutes = null }) => {
  const currentTime = Date.now();
  const lastClearedTimestamp = await getLastClearedTimestamp(uid) || 0;
  let startingTimestamp = lastClearedTimestamp;

  // If minutes is specified, compute the timestamp from x minutes ago
  if (minutes !== null) {
    startingTimestamp = Math.max(currentTime - minutes * 60 * 1000, lastClearedTimestamp);
  }

  const messagesRef = database.ref(`users/${uid}/messages`)
    .orderByChild('timestamp')
    .startAt(startingTimestamp)
    .limitToLast(limitToLast);

  const snapshot = await messagesRef.once('value');
  
  const messages = [];
  snapshot.forEach(childSnapshot => {
    messages.push(childSnapshot.val());
  });

  // Since the messages are ordered by timestamp, they should already be in chronological order
  return messages;
};




module.exports = {
  verifyToken,
  createUserProfileIfNotExist,
  saveMessage,
  registerUserToDatabase,
  getMessagesTimestamps,
  checkRateLimit,
  fetchMainPromptFromFirebase,
  fetchGPTModelFromFirebase,
  validateMessageLength,
  getStoredMessages,
  updateLastClearedTimestamp,
};
