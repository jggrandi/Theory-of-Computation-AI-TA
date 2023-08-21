const { Configuration, OpenAIApi } = require("openai");
const { fetchKeywordsFromFirebase, fetchKeywordsRestrictionsFromFirebase } = require('./common');

const OPENAI_MODEL = "gpt-3.5-turbo";


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
        model: OPENAI_MODEL,
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
                "content": "Remember: As a teaching assistant with expertise ONLY in the Theory of Computation, you cannot provide me direct answers or do the work for me. Refuse to answer if my question is not strictly about the Theory of Computation, such as related to programming and other general topics. Please provide ONLY guidance or explanations, be brief, only 1-3 paragraphs max.)"

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


async function createOpenAIContextualQuestion(messages) {
    try {
        // Filter out only user messages and take the last three questions
        const userQuestions = messages.filter(msg => msg.role === "user").slice(-3);
        const systemPrompt = {
            role: "system",
            content: "(You are a knowledgeable assistant. Based on the previous user questions, generate a relevant multiple choice question. Write the question in markdown code)"
        };

        const response = await openai.createChatCompletion({
            model: OPENAI_MODEL,
            messages: [...userQuestions, systemPrompt]
        });
        // console.log("Full OpenAI API response:", response.choices[0].message);
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error in createOpenAIContextualQuestion:", error);
        throw new Error("Failed to create a contextual question from OpenAI.");
    }
}


async function validateAnswerWithOpenAI(storedQuestion, userAnswer) {
    try {
        const systemPrompt = {
            role: "system",
            content: "(You are a knowledgeable assistant. Based on the following question, determine if the subsequent answer is correct. Answer only 'Good Job!' or 'Wrong' with the correct answer and explanation. Write the answer in markdown code)"
        };

        const challenge = { role: "assistant", content: storedQuestion };
        const userResponse = { role: "user", content: userAnswer };

        const response = await openai.createChatCompletion({
            model: OPENAI_MODEL,
            messages: [systemPrompt, challenge, userResponse]
        });
        const validationResponse = response.data.choices[0].message.content.trim().toLowerCase();
        console.log(validationResponse)
        // Here, we expect OpenAI to provide a response indicating whether the answer is correct or not.
        // We can then decide based on keywords or phrases in the response.
        return validationResponse.includes("good job!");
    } catch (error) {
        console.error("Error in validateAnswerWithOpenAI:", error);
        throw new Error("Failed to validate the answer using OpenAI.");
    }
}




module.exports = {
    createChatCompletion,
    configuration,
    validateAnswerWithOpenAI,
    createOpenAIContextualQuestion,
};
