const {GoogleGenAI}=require('@google/genai');
const { json } = require('express');
require('dotenv').config();

const ai=new GoogleGenAI({apiKey:process.env.GEMINI_KEY || process.env.API_K});

async function GenerateResponse(ShortMemory) {
    const response=await ai.models.generateContent({
        model: process.env.GEMINI_CHAT_MODEL,
        contents:ShortMemory,config:{
            temperature: Number(process.env.GEMINI_TEMPERATURE || 0.7),
            systemInstruction:`You are Astra AI, created by Ritul Jain. Respond in the user's language. Be helpful and accurate.`
        }
    })
    return response.text;
}
async function GenerateVector(contents) {
    const response=await ai.models.embedContent({
        model: process.env.GEMINI_EMBED_MODEL,
        contents:contents,
        config:{
            outputDimensionality: Number(process.env.GEMINI_EMBED_DIMENSIONS || 768)
        }
    })
    return response.embeddings[0].values;
}


module.exports={
    GenerateResponse,
    GenerateVector
};