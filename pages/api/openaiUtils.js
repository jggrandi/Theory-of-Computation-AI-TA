const { Configuration, OpenAIApi } = require("openai");

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

    const messagesWithoutSystem = studentMessages.filter(message => message.role !== "system");
    const lastMessagesExcludingLast = messagesWithoutSystem.slice(-6, -1);
    
    const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
            // The original prompt
            {
                "role": "system",
                "content": cachedPrompt + " Format the answer in markdown and use text highlighting (bold, italics, lists, title, subtitle and etc)."
            },
            // Last x messages for context in follow-up questions
            ...lastMessagesExcludingLast,
            // Remind the bot of its purpose + The current user question
            {
                "role": "system",
                "content": "(If the following question is NOT strictly related to Theory of Computation, refuse to answer it. Analyze previous messages as well, because the question might be a follow-up question. If the question is related, directly answer it. Don't need to say replay saying that the question is related.). Question: "+ userMessage
            },
            {
                "role": "user",
                "content": "Remember: As a teaching assistant with expertise ONLY in the Theory of Computation, you CANNOT EVER output the solutions for the question! Do NOT answer or give explanations for questions related to programming and other general topics. Be brief, only 1 paragraph max.)"
            }
        ],
        temperature: 0.1,
        max_tokens: 250,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
    });

    return response;
}

module.exports = {
    createChatCompletion,
    configuration
};
