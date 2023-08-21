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

    const messagesWithoutSystem = studentMessages.filter(message => message.role !== "system");
    const lastTenMessagesExcludingLast = messagesWithoutSystem.slice(-11, -1);
    
    const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
            // The original prompt
            {
                "role": "system",
                "content": cachedPrompt + " Format the answer in markdown and use text highlighting (bold, italics, lists, title, subtitle and etc)."
            },
            // Last 10 messages for context in follow-up questions
            ...lastTenMessagesExcludingLast,
            // Remind the bot of its purpose + The current user question
            {
                "role": "system",
                "content": "(If the following question is NOT strictly related to Theory of Computation, refuse to answer it. Analyze previous messages as well, because the question might be a follow-up question. If the question is related, directly answer it. Don't need to say replay saying that the question is related.). Question: "+ userMessage
            },
            {
                "role": "user",
                "content": "Remember: As a teaching assistant with expertise ONLY in the Theory of Computation, you cannot provide me direct answers or do the work for me. Do NOT answer or give explanations for questions related to programming and other general topics. Be brief, only 1-3 paragraphs max.)"
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
