const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

async function createChatCompletion(cachedPrompt, studentMessages) {
    if (!cachedPrompt) {
        throw new Error("Cached prompt is not yet available.");
    }

    const lastTenMessagesExcludingLast = studentMessages.slice(studentMessages.length - 11, studentMessages.length - 1);
    const lastMessage = studentMessages.slice(-1)
    const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
            // The orginial prompt
            {
                "role": "system",
                "content": cachedPrompt
            },
            // Last 10 messages for context in follow-up questions
            ...lastTenMessagesExcludingLast,
            // Befor the current user question remind the bot of its propose
            {
                "role": "user",
                "content": "Remind me what is your propose?"
            },
            {
                "role": "assistant",
                "content": "As a teaching assistant in the theory of computation course, my purpose is to provide guidance, hints, and support to help you understand and solve problems related to the course material. I can assist you in understanding concepts, providing hints for problem-solving, and clarifying any doubts you may have. However, I cannot provide direct answers or do the work for you."
            },
            // The current user question
            ...lastMessage,
        ],
        temperature: 0.15,
        max_tokens: 256,
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
