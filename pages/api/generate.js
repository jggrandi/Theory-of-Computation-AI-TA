const { verifyToken, saveUserMessage, checkRateLimit, fetchMainPromptFromFirebase } = require('./common');
const { getDecryptedPrompt } = require('./encryptionUtils');
const { createChatCompletion, configuration, validateAnswerWithOpenAI, createOpenAIContextualQuestion, } = require('./openaiUtils');

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

let challengeQuestionsStore = {};

function storeChallengeQuestionTemporarily(uid, question) {
    challengeQuestionsStore[uid] = question;
}

function retrieveStoredChallengeQuestion(uid) {
    return challengeQuestionsStore[uid] || null;
}

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
  // const userName = user.name || "Unknown User";


  if (!configuration.apiKey) {
    return res.status(500).json({
      error: {
        message: "OpenAI API key not configured, please follow instructions in README.md",
      }
    });
  }
  const { messageType, userAnswer } = req.body;

  const rateLimitError = await checkRateLimit(uid);
  
  // If the user has hit the rate limit and they haven't provided an answer to the challenge yet
  if (rateLimitError && messageType !== 'challenge_answer') {
  
      const context = req.body.messages || [];
      const challengeQuestion = await createOpenAIContextualQuestion(context);
  
      // Temporarily store the generated challenge question
      storeChallengeQuestionTemporarily(uid, challengeQuestion);
  
      return res.json({
          type: 'challenge_question',
          content: "Challenge Question: " + challengeQuestion
      });
  } 
  
  // If the message type is a challenge answer
  if (messageType === 'challenge_answer') {
      const storedChallengeQuestion = retrieveStoredChallengeQuestion(uid);
      const responseFromOpenAI = await validateAnswerWithOpenAI(storedChallengeQuestion, userAnswer);
      
      return res.json({
          type: 'challenge_response',
          content: responseFromOpenAI.choices[0].message.content
      });
  }
  const studentMessages = req.body.messages || [];
  const lastTenMessages = studentMessages.slice(-10);
  const studentCurrentQuestion = studentMessages.length ? studentMessages[studentMessages.length - 1].content : '';
  // If the message type is a regular question or not provided (for backward compatibility)
  if (!messageType || messageType === 'regular_question') {
   
    if (studentCurrentQuestion.length > 200) {
      return res.status(400).json({
        error: {
          message: "Your message exceeds the 200 character limit.",
        }
      });
    }
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