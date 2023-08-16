const { verifyToken, saveUserMessage, checkRateLimit, fetchMainPromptFromFirebase} = require('./common');
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
  const userName = user.name || "Unknown User";


  if (!configuration.apiKey) {
    return res.status(500).json({
      error: {
        message: "OpenAI API key not configured, please follow instructions in README.md",
      }
    });
  }

  const rateLimitError = await checkRateLimit(uid);
  if (rateLimitError) {
    return res.status(rateLimitError.status).json(rateLimitError); // Send the error response here
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

  try {

    const response = await createChatCompletion(cachedPrompt, studentMessages);
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