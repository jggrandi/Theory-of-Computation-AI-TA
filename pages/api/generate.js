const { verifyToken, saveMessage, checkRateLimit, fetchMainPromptFromFirebase, fetchGPTModelFromFirebase, validateMessageLength, getStoredMessages} = require('./common');
const { getDecryptedPrompt } = require('./encryptionUtils');
const { createChatCompletion, configuration } = require('./openaiUtils');

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
  
  const firebaseMainPrompt = await fetchMainPromptFromFirebase();
  if (firebaseMainPrompt) {
    cachedPrompt = firebaseMainPrompt;
  }
  else {
    // Refresh the cache if the prompt is stale
    if (!cachedPrompt || Date.now() - lastUpdated > CACHE_DURATION_MS) {
      await fetchAndCachePrompt();
    }
  }

  const firebaseGPTModel = await fetchGPTModelFromFirebase();

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

  const uid = user.uid;

  if (!configuration.apiKey) {
    return res.status(500).json({
      error: {
        message: "OpenAI API key not configured, please follow instructions in README.md",
      }
    });
  }

  const rateLimitError = await checkRateLimit(uid);
  if (rateLimitError) {

    res.json({
      role: "system",
      content: rateLimitError.error.message,
      isSystemAlert: true
    });
    return;
  }
  
  const userQuestion = req.body.userQuestion || [];
  //const studentCurrentQuestion = studentMessages.length ? studentMessages[studentMessages.length - 1] : '';
  
  // Validate the length of the student's message
  const errorMessage = validateMessageLength(userQuestion.content);

  if (errorMessage) {
      // If there's an error message, append it to the messages list and send the response
      res.json({
          role: "system",
          content: errorMessage
      });
      return;
  }

  try {

    // Save user's message to Firebase Realtime Database
    await saveMessage(uid, userQuestion.role, userQuestion.content);
    
    const serverMessages = await getStoredMessages({uid:uid, minutes:10});

    const response = await createChatCompletion(cachedPrompt, firebaseGPTModel, serverMessages);
    const assistantMessage = response.data.choices[0].message;

    // Save assistant's response to Firebase Realtime Database
    await saveMessage(uid, "assistant", assistantMessage.content);

    res.status(200).json({role: "assistant", content: response.data.choices[0].message.content });
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