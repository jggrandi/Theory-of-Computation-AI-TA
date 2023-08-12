const { checkAndUpdateUserQuota } = require('./middleware');
const { verifyToken, database, createUserProfileIfNotExist, saveUserMessage } = require('./common');
const { Configuration, OpenAIApi } = require("openai");
const axios = require('axios');
const crypto = require('crypto');

if (!process.env.OPENAI_API_KEY || !process.env.PROMPT_DECRYPT_KEY) {
  throw new Error("Missing essential environment variables. Ensure both OPENAI_API_KEY and PROMPT_DECRYPT_KEY are set.");
}

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

const ENCRYPTED_PROMPT_URL = "http://irlab.uncg.edu/resources/encrypted_prompt.enc";
const PROMPT_DECRYPT_KEY = process.env.PROMPT_DECRYPT_KEY;

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



export default async function (req, res) {
  // Refresh the cache if the prompt is stale
  if (!cachedPrompt || Date.now() - lastUpdated > CACHE_DURATION_MS) {
    await fetchAndCachePrompt();
  }

  // Token from client request
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: { message: "No token provided" } });
  }

  const user = await verifyToken(token);
  // console.log(user)
  if (!user) {
    return res.status(403).json({ error: { message: "Invalid or expired token" } });
  }

  // Check and update user quota
  try {
    await checkAndUpdateUserQuota(req, res, () => { });
  } catch (error) {
    // Handle errors related to quota check
    console.error("Error checking quota:", error);
    return res.status(500).json({ error: { message: "Internal Server Error" } });
  }
  console.log(req)
  // Assume the user sends a message in the request body
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({
      error: {
        message: "No message provided in the request",
      }
    });
  }

  const studentMessages = req.body.messages || [];
  const lastTenMessages = studentMessages.slice(-10);
  const studentCurrentQuestion = studentMessages.length ? studentMessages[studentMessages.length - 1].content : '';

  // Validate the length of the student's message
  if (studentCurrentQuestion.length > 200) {
    return res.status(400).json({
      error: {
        message: "Your message exceeds the 200 character limit.",
      }
    });
  }

  // Save user's message to the database
  const messageId = await saveUserMessage(user.uid, userMessage);
  if (!messageId) {
    return res.status(500).json({
      error: {
        message: "Failed to save the message. Try again later.",
      }
    });
  }

  // Successfully saved the message, return its ID to the user
  return res.status(201).json({ messageId });


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
      presence_penalty: 0
    });

    const assistantMessage = response.data.choices[0].message.content;

    // Save to Firebase Realtime Database
    await saveUserMessage(user.uid, studentCurrentQuestion, assistantMessage);

    res.status(200).json({ result: response.data.choices[0].message.content });
  } catch (error) {
    if (error.response) {
      console.error(error.response.status, error.response.data);
      res.status(error.response.status).json({
        error: {
          message: `OpenAI API error: ${error.response.data.error.message}`,
        }
      });
    } else {
      console.error(`Error with OpenAI API request: ${error.message}`);
      res.status(500).json({
        error: {
          message: `Internal server error: ${error.message}`,
        }
      });
    }
  }
}