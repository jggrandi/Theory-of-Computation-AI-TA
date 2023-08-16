const { Configuration, OpenAIApi } = require("openai");
const { fetchKeywordsFromFirebase, fetchKeywordsRestrictionsFromFirebase } = require('./common');

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

async function createChatCompletion(cachedPrompt, studentMessages) {
    if (!cachedPrompt) {
        throw new Error("Cached prompt is not yet available.");
    }

    // Extract the user's last message
    const userMessage = studentMessages[studentMessages.length - 1].content;

    // Fetch restrictions from Firebase
    const allowRestrictions = await fetchKeywordsRestrictionsFromFirebase();

    if (allowRestrictions) {
        // Fetch keywords from Firebase
        const keywords = await fetchKeywordsFromFirebase();

        // Check if the user's message contains any of the fetched keywords
        const containsKeyword = keywords.some(keyword => userMessage.toLowerCase().includes(keyword.toLowerCase()));

        if (!containsKeyword) {
            return {
                data: {
                    choices: [{
                        message: {
                            content: "Sorry, I can only answer questions related to the Theory of Computation."
                        }
                    }]
                }
            };
        }
    }


    const lastTenMessagesExcludingLast = studentMessages.slice(studentMessages.length - 11, studentMessages.length - 1);
    const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
            // The original prompt
            {
                "role": "system",
                "content": cachedPrompt
            },
            // Last 10 messages for context in follow-up questions
            ...lastTenMessagesExcludingLast,
            // Remind the bot of its purpose + The current user question
            {
                "role": "user",
                "content": "As a teaching assistant with expertise ONLY in the Theory of Computation, your can only is to provide guidance, hints, and support to help me understand and solve problems ONLY related to theory of computation. You cannot provide me direct answers or do the work for me. If my question is not strictly and directly about the Theory of Computation refuse to answer. You cannot show me any code. Please be brief, only 3 paragraphs max. My question: " + userMessage
            }
        ],
        temperature: 0.1,
        max_tokens: 300,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
    });

    if (allowRestrictions) {
        // Extract the assistant's response message
        const assistantMessage = response.data.choices[0].message.content;

        // Check if the assistant's response contains any of the fetched keywords
        const responseContainsKeyword = keywords.some(keyword => assistantMessage.toLowerCase().includes(keyword.toLowerCase()));

        if (!responseContainsKeyword) {
            response.data.choices[0].message.content = "Sorry, my response was not related to the Theory of Computation. Please ask another question or rephrase.";
        }
    }
    return response;
}

module.exports = {
    createChatCompletion,
    configuration
};
