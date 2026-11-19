const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { v4: uuidv4 } = require('uuid');
const axios = require("axios");
const ChatgptIndex=require('../services/vectordb');
const GenerateVector=require('../services/ai-service').GenerateVector;
const { tavily } = require('@tavily/core');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const searchWeather = tool(
  async ({ city }, config) => {
    const token = config?.metadata?.token;
    if (!process.env.WEATHER_API_KEY) {
      return 'Weather lookup is not configured.';
    }

    const response = await axios.get(
      `${process.env.WEATHER_API_URL || 'https://api.weatherapi.com/v1/current.json'}?key=${encodeURIComponent(process.env.WEATHER_API_KEY)}&q=${encodeURIComponent(city)}`,
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
   console.log(city);
    if (!process.env.NEWS_API_KEY) {
      return 'News lookup is not configured.';
    }
 const res=   await axios.get(
      `${process.env.NEWS_API_URL || 'https://newsapi.org/v2/everything'}?q=${encodeURIComponent(city)}&apiKey=${encodeURIComponent(process.env.NEWS_API_KEY)}`
    );
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let gmailTransporter;
function getGmailTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return null;
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
    });
  }
  return gmailTransporter;
}

const getEmailTemplate = (subject, msg, includeLogo) => {
  const site = process.env.APP_URL || '';
  const brand = process.env.MAIL_FROM_NAME || 'Astra AI';
  const websiteLink = site
    ? `<a href="${escapeHtml(site)}" style="display: inline-block; color: #0ea5e9; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 12px;">Website</a>`
    : '';
  return `
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
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px; text-align: center;">
                            ${includeLogo
                              ? '<img src="cid:aastraalogo" width="100" height="100" alt="Aastraa Logo" style="display: block;">'
                              : `<div style="font-size: 22px; font-weight: 700; color: #0ea5e9;">${escapeHtml(brand)}</div>`}
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 40px 40px 30px 40px;">
                            <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 20px; font-size: 20px; font-weight: 700;">${escapeHtml(subject)}</h2>
                            <div style="font-size: 16px; line-height: 1.6; color: #475569;">
                                ${escapeHtml(msg).replace(/\n/g, '<br>')}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer with Gray Tones -->
                    <tr>
                        <td style="background-color: #f1f5f9; padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <div style="margin-bottom: 16px;">
                                ${websiteLink}
                                <a href="#" style="display: inline-block; color: #64748b; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 12px;">Support</a>
                                <a href="#" style="display: inline-block; color: #64748b; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 12px;">Privacy</a>
                            </div>
                            <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                                &copy; ${new Date().getFullYear()} ${escapeHtml(brand)}. All rights reserved.<br>
                                Sent via ${escapeHtml(brand)}.
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
};

function hideConfiguredAddresses(text) {
  let safe = String(text || '');
  for (const secret of [process.env.GMAIL_USER, process.env.RESEND_FROM]) {
    const value = String(secret || '').trim();
    if (value) safe = safe.split(value).join('the sending account');
  }
  return safe;
}

function verifiedResendFrom() {
  const from = String(process.env.RESEND_FROM || '').trim();
  // onboarding@resend.dev returns an id without delivering to a normal inbox.
  if (!from || /resend\.dev/i.test(from)) return null;
  return from;
}

async function sendEmail(to, subject, msg) {
  const recipient = String(to || '').trim();
  const emailSubject = String(subject || '').trim() || 'Message from Aastraa AI';
  const body = String(msg || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return `Error sending email: "${recipient}" is not a valid email address.`;
  }
  if (!body) {
    return 'Error sending email: the message body is empty.';
  }

  const logoPath = path.join(__dirname, 'logo.png');
  const hasLogo = fs.existsSync(logoPath);
  const logoData = hasLogo ? fs.readFileSync(logoPath) : null;
  const html = getEmailTemplate(emailSubject, body, hasLogo);
  const errors = [];
  const resendFrom = verifiedResendFrom();

  if (resendFrom && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const attachments = logoData
        ? [{
            filename: 'logo.png',
            content: logoData.toString('base64'),
            contentType: 'image/png',
            contentId: 'aastraalogo',
          }]
        : undefined;

      const data = await resend.emails.send({
        from: resendFrom,
        to: [recipient],
        subject: emailSubject,
        text: body,
        html,
        attachments,
      });

      if (!data.error && data.data?.id) {
        console.log('Email accepted by Resend:', data.data.id);
        return `Mail accepted for delivery to ${recipient}. Ask the user to check the inbox and spam folder. Do not mention the sending account.`;
      }

      console.error('Resend error:', data.error?.message || data.error || 'no message id');
      errors.push(`Resend: ${data.error?.message || 'the provider did not accept the email'}`);
    } catch (err) {
      console.error('Resend exception:', err.message || err);
      errors.push(`Resend: ${err.message || err}`);
    }
  }

  try {
    const transporter = getGmailTransporter();
    if (!transporter) {
      errors.push('Gmail: GMAIL_USER or GMAIL_PASS is not set');
    } else {
      const info = await transporter.sendMail({
        from: `${process.env.MAIL_FROM_NAME || 'Astra AI'} <${process.env.GMAIL_USER}>`,
        to: recipient,
        subject: emailSubject,
        text: body,
        html,
        attachments: hasLogo ? [{ filename: 'logo.png', path: logoPath, cid: 'aastraalogo' }] : [],
      });
      const accepted = info.accepted || [];
      const rejected = info.rejected || [];
      if (!accepted.length || rejected.length) {
        throw new Error(`recipient was not accepted (${rejected.join(', ') || 'none accepted'})`);
      }
      console.log('Email accepted by Gmail:', info.messageId, 'accepted:', accepted.join(','));
      return `Mail accepted for delivery to ${recipient}. Ask the user to check the inbox and the spam folder. Do not mention the sending account, and do not say it arrived until they confirm they can see it.`;
    }
  } catch (err) {
    console.error('Gmail exception:', err.message || err);
    errors.push(`Gmail: ${err.message || err}`);
  }

  return hideConfiguredAddresses(`Error sending email: ${errors.join(' | ') || 'no mail provider accepted the message'}`);
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
