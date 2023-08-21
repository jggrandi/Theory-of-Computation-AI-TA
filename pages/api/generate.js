const { verifyToken, saveUserMessage, checkRateLimit, fetchMainPromptFromFirebase, validateMessageLength} = require('./common');
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
  // console.log("Server received messageType:", req.body.messageType);

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

  if (!configuration.apiKey) {
    return res.status(500).json({
      error: {
        message: "OpenAI API key not configured, please follow instructions in README.md",
      }
    });
  }
  const { messageType, message } = req.body;


  // If the message type is a challenge answer
  if (messageType === 'challenge_answer') {
    const storedChallengeQuestion = retrieveStoredChallengeQuestion(uid);
    console.log("Question: " + storedChallengeQuestion + "---- Answer: " + message);
    const responseFromOpenAI = await validateAnswerWithOpenAI(storedChallengeQuestion, message);
    console.log(responseFromOpenAI)
    // Here, you might want to reset or adjust the user's rate limit
    // (Depending on your rate limiting logic)

    return res.json({
      type: 'challenge_response',
      content: responseFromOpenAI
    });

  // const rateLimitError = await checkRateLimit(uid);
  // if (rateLimitError) {

  //   res.json({
  //     role: "system",
  //     content: rateLimitError.error.message
  //   });
  //   return;
  // }
  
  // const studentMessages = req.body.messages || [];
  // const studentCurrentQuestion = studentMessages.length ? studentMessages[studentMessages.length - 1].content : '';

  // // Validate the length of the student's message
  // const errorMessage = validateMessageLength(req);

  // if (errorMessage) {
  //     // If there's an error message, append it to the messages list and send the response
  //     res.json({
  //         role: "system",
  //         content: errorMessage
  //     });
  //     return;
  
  }


  const rateLimitError = await checkRateLimit(uid);

  // If the user has hit the rate limit and they haven't provided an answer to the challenge yet
  if (rateLimitError) {
    const context = req.body.messages || [];
    const challengeQuestion = await createOpenAIContextualQuestion(context);

    // Temporarily store the generated challenge question
    storeChallengeQuestionTemporarily(uid, challengeQuestion);

    return res.json({
      type: 'challenge_question',
      content: "You have reached your messages quota. Correctly answer the following question get back one message.\n Question: " + challengeQuestion
    });
  }


  const studentMessages = req.body.messages || [];
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