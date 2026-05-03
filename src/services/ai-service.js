const {GoogleGenAI}=require('@google/genai');
const { json } = require('express');
require('dotenv').config();

const ai=new GoogleGenAI({apiKey:process.env.API_K});

async function GenerateResponse(ShortMemory) {
    const response=await ai.models.generateContent({
        model:"gemini-1.5-flash",
        contents:ShortMemory,config:{
            temperature:0.7,
            systemInstruction:`You are Astra AI, created by Ritul Jain. Respond in the user's language. Be helpful and accurate.`
        }
    })
    return response.text;
}
async function GenerateVector(contents) {
    const response=await ai.models.embedContent({
        model:"gemini-embedding-001",
        contents:contents,
        config:{
            outputDimensionality:768
        }
    })
    return response.embeddings[0].values;
}


module.exports={
    GenerateResponse,
    GenerateVector
};