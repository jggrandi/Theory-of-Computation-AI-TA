const { Configuration, OpenAIApi } = require("openai");
const axios = require('axios');
const crypto = require('crypto');

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
    console.log("Decrypted Content:", decrypted.toString());
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
console.log("Initiating fetchAndCachePrompt");
export default async function (req, res) {

  // Refresh the cache if the prompt is stale
  if (!cachedPrompt || Date.now() - lastUpdated > CACHE_DURATION_MS) {
    await fetchAndCachePrompt();
  }

  if (!configuration.apiKey) {
    return res.status(500).json({
      error: {
        message: "OpenAI API key not configured, please follow instructions in README.md",
      }
    });
  }

  const studentMessages = req.body.messages || [];
  const studentQuestion = studentMessages.length ? studentMessages[studentMessages.length - 1].content : '';

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
        ...studentMessages,
        {
          "role": "user",
          "content": studentQuestion
        },
      ],
      temperature: 0.15,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

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
