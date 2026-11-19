const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();
const fs=require('fs');
const ai=new GoogleGenAI({ apiKey: process.env.GEMINI_KEY || process.env.API_K });
const main =async(ques,buffer,mime)=> {

  const base64 = buffer.toString("base64");
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_ANALYSE_MODEL,
    contents: [
      { role: "user", parts: [
        { text: ques },
        {
          inlineData: {
            data: base64,
            mimeType: mime 
          }
        }
      ]}
    ]
  });
  return response.text;
}

module.exports=main;

