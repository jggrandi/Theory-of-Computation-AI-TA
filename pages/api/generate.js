const admin = require('firebase-admin');
const { Configuration, OpenAIApi } = require("openai");
const axios = require('axios');
const crypto = require('crypto');

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

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const ENCRYPTED_PROMPT_URL = "http://irlab.uncg.edu/resources/encrypted_prompt.enc";
const PROMPT_DECRYPT_KEY = process.env.PROMPT_DECRYPT_KEY; // Ensure this is set in your environment variables

async function getDecryptedPrompt() {
  try {
    const { data } = await axios.get(ENCRYPTED_PROMPT_URL, { responseType: 'arraybuffer' });

    // Extract salt from openssl's output (starts after 'Salted__')
    const salt = data.slice(8, 16);

    // Derive key and IV separately from passphrase and salt
    const keyAndIv = crypto.pbkdf2Sync(PROMPT_DECRYPT_KEY, salt, 10000, 48, 'sha256');
    const key = keyAndIv.subarray(0, 32);
    const iv = keyAndIv.subarray(32, 48);

    // Extract actual encrypted data
    const encryptedData = data.slice(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return JSON.parse(decrypted.toString()).content;

  } catch (err) {
    console.error("Error in getDecryptedPrompt:", err);
    throw err;
  }
}

const CACHE_DURATION_MS = 3600000;  // 1 hour

let cachedPrompt = null;
let lastUpdated = null;

async function fetchAndCachePrompt() {
  try {
    const decryptedPrompt = await getDecryptedPrompt();
    cachedPrompt = decryptedPrompt;
    lastUpdated = Date.now();
  } catch (error) {
    console.error("Failed to update the cached prompt:", error);
  }
}

// Fetch and cache the prompt immediately upon server startup
fetchAndCachePrompt();

const verifyToken = async (token) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error("Error verifying token:", error);
    return null;
  }
};

async function createUserProfileIfNotExist(uid, userName) {
  const userProfileRef = database.ref(`users/${uid}/profile`);
  const snapshot = await userProfileRef.once('value');
  if (!snapshot.exists()) {
    // Create profile for first-time users
    userProfileRef.set({
      userName: userName
    });
  }
}

async function saveUserMessage(uid, studentCurrentQuestion, assistantMessage) {
  const userMessagesRef = database.ref(`users/${uid}/messages`).push();
  await userMessagesRef.set({
    userMessage: studentCurrentQuestion,
    assistantMessage: assistantMessage,
    timestamp: Date.now()
  });
}



export default async function (req, res) {

  // Refresh the cache if the prompt is stale
  if (!cachedPrompt || Date.now() - lastUpdated > CACHE_DURATION_MS) {
    await fetchAndCachePrompt();
  }

  // Token from client request
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: {
        message: "No token provided",
      }
    });
  }

  const user = await verifyToken(token);
  if (!user) {
    return res.status(403).json({
      error: {
        message: "Invalid or expired token",
      }
    });
  }

  // After verifying the token, get the user's UID and display name
  const uid = user.uid;
  const userName = user.name || "Unknown User";

  // Create a profile if it doesn't exist
  await createUserProfileIfNotExist(uid, userName);

  if (!configuration.apiKey) {
    return res.status(500).json({
      error: {
        message: "OpenAI API key not configured, please follow instructions in README.md",
      }
    });
  }


  const studentMessages = req.body.messages || [];
  const lastTenMessages = studentMessages.slice(-10);
  const studentCurrentQuestion = studentMessages.length ? studentMessages[studentMessages.length - 1].content : '';
  const clientUserInfo = req.body.user;

  // Validate the length of the student's message
  if (studentCurrentQuestion.length > 200) {
    return res.status(400).json({
      error: {
        message: "Your message exceeds the 200 character limit.",
      },
    });
  }
  try {

    if (!cachedPrompt) {
      throw new Error("Cached prompt is not yet available.");
    }

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          "role": "system",
          "content": cachedPrompt
        },
        ...lastTenMessages
      ],
      temperature: 0.15,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    // Extract the assistant's response
    const assistantMessage = response.data.choices[0].message.content;

    // Save to Firebase Realtime Database
    await saveUserMessage(uid, studentCurrentQuestion, assistantMessage);

    res.status(200).json({ result: response.data.choices[0].message.content });
  } catch (error) {
    if (error.response) {
      console.error(error.response.status, error.response.data);
      res.status(error.response.status).json({
        error: {
          message: `OpenAI API error: ${error.response.data.error.message}`,
        },
      });
    } else {
      console.error(`Error with OpenAI API request: ${error.message}`);
      res.status(500).json({
        error: {
          message: `Internal server error: ${error.message}`,
        },
      });
    }
  }
}
