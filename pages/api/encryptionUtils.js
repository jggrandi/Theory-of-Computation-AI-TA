const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises; // Use promises version for async/await

const ENCRYPTED_PROMPT_URL = "http://irlab.uncg.edu/resources/encrypted_prompt.enc";
const PROMPT_DECRYPT_KEY = process.env.PROMPT_DECRYPT_KEY;
const ENCRYPTED_LOCAL_FILE = path.join(process.cwd(), 'prompts', 'encrypted_prompt.enc');

async function getDecryptedPrompt() {
    let data;

    try {
        const response = await axios.get(ENCRYPTED_PROMPT_URL, { responseType: 'arraybuffer' });
        data = response.data;
    } catch (err) {
        console.warn("Unable to fetch the encrypted prompt online. Using local file as a fallback.");
        try {
            //Get local prompt, may be not updated to the latest version.
            data = await fs.readFile(ENCRYPTED_LOCAL_FILE);
        } catch (fileError) {
            console.error("Error reading the local encrypted file:", fileError);
            throw fileError;
        }
    }

    try {
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

    } catch (decryptionError) {
        console.error("Error in decryption process:", decryptionError);
        throw decryptionError;
    }
}

module.exports = {
    getDecryptedPrompt
};
