const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { v4: uuidv4 } = require('uuid');
const axios = require("axios");
const ChatgptIndex=require('../services/vectordb');
const GenerateVector=require('../services/ai-service').GenerateVector;
const { tavily } = require('@tavily/core');
const nodemailer=require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Use STARTTLS for better compatibility
  family: 4,     // Force IPv4 to avoid ENETUNREACH on IPv6-only routes
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeout: 20000, 
  greetingTimeout: 20000,
  socketTimeout: 20000
});
const searchWeather = tool(
  async ({ city }, config) => {
    const token = config.metadata.token;

    const response = await axios.get(
      `https://api.weatherapi.com/v1/current.json?key=2e8d6b81d55e4511be3100050251808&q=${city}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return JSON.stringify(response.data);
  },
  {
    name: "searchWeather",
    description: "Search Weather using a city as a string",
    schema: z.object({
      city: z.string().describe("Search keyword"),
    }),
  }
);

const TopNewsOfCity = tool(
  async ({ city}, config) => {
    //const token = config.metadata.token;
   //// if(quantity>stock) throw Error('The Quantity Of Product Exceeds the Stock')
   console.log(city);
 const res=   await axios.get(
      `https://newsapi.org/v2/everything?q=${city}&apiKey=0e0fac0115ca4157b70faf01e30adb1f`
    );
      //console.log(res.data.articles)
      const news=[];
    for(let i=0;i<=10;i++){
      news.push(res.data?.articles[i]?.description||"NOT FOUND");
    }
   
    return  JSON.stringify(news);
  },
  {
    name: "TopNewsOfCity",
    description: "Gives Top News Of City",
    schema: z.object({
      city:z.string().describe(`The Name of the City for which News to be find`)
    }),
  }
);

const longtermMemoryTool = tool(
  

    async ({ mode, text, userId }, config) => {

   
      const effectiveUserId = userId || config?.metadata?.userId;

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return "Error: longtermMemoryTool requires a valid 'text' parameter to store or retrieve information. Please provide it.";
      }
    
      if (!effectiveUserId) {
        return "Error: longtermMemoryTool requires 'userId'.";
      }
     
    
    
    try {
      const vectors = await GenerateVector(text);
      if (mode === 'store') {

        await ChatgptIndex.upsert(
          [
            {
              id: uuidv4(),
              values: vectors,
              metadata: {
                user: effectiveUserId,
                msg: text
              }
            }
          ]
        );
        return "Information stored successfully.";
      }
      else if (mode === 'retrieve') {
        const results = await ChatgptIndex.query({
          topK: 3,
          vector: vectors,
          includeMetadata: true,
          filter: {
            user: effectiveUserId
          }
        });
        return JSON.stringify(results.matches.map((match) => match.metadata.msg));
      }
    } catch (err) {
      console.error("Long-term memory tool error:", err);
      return `Error in long-term memory tool: ${err.message || err}. Please proceed without memory if this persists.`;
    }

  },{
    name:"longtermMemoryTool",
    description:"use this tool to store and retrieve information from longterm memory",
    schema:z.object({
      mode:z.enum(['store','retrieve']).describe('store or retrieve information from longterm memory'),
      text:z.string().describe('The text to store or retrieve (e.g., user fact or query)'),
      userId:z.string().optional().describe('The ID of the user (optional, will be handled automatically)')
    })
  }
);

const webSearchTool = tool(async ({query})=>{
  
  try {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const ans = await client.search(query, {
      searchDepth: "basic",
      maxResults: 3
    });
    
    const optimizedResults = ans.results.map(res => ({
      title: res.title,
      content: res.content,
      url: res.url
    }));

    return JSON.stringify(optimizedResults);
  } catch(err) {
    console.error("Tavily search error:", err);
    return "Error: Web search failed. Please inform the user that you are currently unable to search the web due to an internal error.";
  }
},{
  name:"webSearchTool",
  description:"use this tool to search the query on web",
  schema:z.object({
    query:z.string().describe('query that needs to be search in webtool')
  })
})

const getEmailTemplate = (subject, msg) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #334155;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 0;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin: 0 20px; border: 1px solid #e2e8f0;">
                    <!-- Minimalist Header with Logo Only -->
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px; text-align: center;">
                            <img src="cid:aastraalogo" width="100" height="100" alt="Aastraa Logo" style="display: block;">
                        </td>
                    </tr>
                    
                    <!-- Content Area -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px;">
                            <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 20px; font-size: 20px; font-weight: 700;">${subject}</h2>
                            <div style="font-size: 16px; line-height: 1.6; color: #475569;">
                                ${msg.replace(/\n/g, '<br>')}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer with Gray Tones -->
                    <tr>
                        <td style="background-color: #f1f5f9; padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <div style="margin-bottom: 16px;">
                                <a href="https://aastraa.vercel.app" style="display: inline-block; color: #0ea5e9; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 12px;">Website</a>
                                <a href="#" style="display: inline-block; color: #64748b; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 12px;">Support</a>
                                <a href="#" style="display: inline-block; color: #64748b; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 12px;">Privacy</a>
                            </div>
                            <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                                &copy; 2026 Aastraa AI. All rights reserved.<br>
                                Sent via Aastraa Intelligent Agent Service.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

async function sendEmail(to, subject, msg) {

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.error("Email credentials missing in environment variables.");
    return "Error: Email service is not configured correctly (missing credentials).";
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const logoPath = path.join(__dirname, 'logo.png');
    
    const mailOptions = {
      from: `Aastraa AI <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: getEmailTemplate(subject, msg),
      attachments: []
    };

    // Only attach logo if it exists to prevent errors
    if (fs.existsSync(logoPath)) {
      mailOptions.attachments.push({
        filename: 'logo.png',
        path: logoPath,
        cid: 'aastraalogo'
      });
    }

    const result = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", result.messageId);
    return `Mail successfully sent to ${to}`;
  } catch (err) {
    console.error("Email send error details:", err);
    return `Error sending email: ${err.message || err}`;
  }
}

const emailSendTool = tool(async ({ to, subject, msg }) => {
  const result = await sendEmail(to, subject, msg);
  return JSON.stringify({ status: result.includes("Error") ? "error" : "success", message: result });
}, {
  name: "emailSendTool",
  description: "sends professional and formal emails to the provided email address. DO NOT use markdown formatting like ** in the message content. Ensure the tone is highly professional and suitable for business communication.",
  schema: z.object({
    to: z.string().describe("The recipient's email address"),
    subject: z.string().describe("The subject of the email (formal)"),
    msg: z.string().describe("The highly professional HTML or text content of the email message. Do not use special markdown characters like **."),
  })
})

 

module.exports = {
  searchWeather,
  TopNewsOfCity,
  longtermMemoryTool,
  webSearchTool,
  emailSendTool
};
