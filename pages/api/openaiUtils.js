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


    const lastTenMessagesExcludingLast = studentMessages.slice(studentMessages.length - 11, studentMessages.length - 1);
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
                "role": "user",
                "content": "(Remember: As a teaching assistant with expertise ONLY in the Theory of Computation, you cannot provide me direct answers or do the work for me. If my question is not strictly about the Theory of Computation, refuse to answer. Please provide guidance or explanations, be brief, only 1-3 paragraphs max.) My question: " + userMessage 
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
    // Filter out only user messages and take the last three questions
    const userQuestions = messages.filter(msg => msg.role === "user").slice(-3);
    const systemPrompt = {
        role: "system",
        content: "You are a knowledgeable assistant. Based on the previous user questions, generate a relevant challenge question."
    };

    const response = await openai.createChatCompletion({
        model: OPENAI_MODEL,
        messages: [...userQuestions, systemPrompt]
    });

    return response.data.choices[0].message.content.trim();

}

async function validateAnswerWithOpenAI(storedQuestion, userAnswer) {
    const systemPrompt = {
        role: "system",
        content: "You are a knowledgeable assistant. Based on the following challenge question, determine if the subsequent answer is correct. Explicity add the word 'Correct' if the answer is correct"
    };

    const challenge = { role: "user", content: storedQuestion };
    const userResponse = { role: "user", content: userAnswer };
    // console.log(challenge + " ---- " + userResponse)

    const response = await openai.createChatCompletion({
        model: OPENAI_MODEL,
        messages: [systemPrompt, challenge, userResponse]
    });
    
    const validationResponse = response.data.choices[0].message.content.trim().toLowerCase();
    
    // Here, we expect OpenAI to provide a response indicating whether the answer is correct or not.
    // We can then decide based on keywords or phrases in the response.
    return validationResponse.includes("correct") || validationResponse.includes("right");
}



module.exports = {
    createChatCompletion,
    configuration,
    validateAnswerWithOpenAI,
    createOpenAIContextualQuestion,
};
