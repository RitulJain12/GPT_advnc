const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
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

    try {
      const response = await axios.get(
        `${process.env.WEATHER_API_URL || 'https://api.weatherapi.com/v1/current.json'}?key=${encodeURIComponent(process.env.WEATHER_API_KEY)}&q=${encodeURIComponent(city)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 12000,
        }
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const status = err.response?.status;
      console.error('Weather lookup failed:', status || err.message);
      return 'Weather lookup failed. Continue without live weather.';
    }
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
    try {
      const res = await axios.get(
        `${process.env.NEWS_API_URL || 'https://newsapi.org/v2/everything'}?q=${encodeURIComponent(city)}&apiKey=${encodeURIComponent(process.env.NEWS_API_KEY)}`,
        { timeout: 12000 }
      );
      const articles = Array.isArray(res.data?.articles) ? res.data.articles : [];
      const news = [];
      for (let i = 0; i < Math.min(10, articles.length); i++) {
        news.push(articles[i]?.description || 'NOT FOUND');
      }
      if (!news.length) return 'No news articles were returned.';
      return JSON.stringify(news);
    } catch (err) {
      const status = err.response?.status;
      console.error('News lookup failed:', status || err.message);
      return 'News lookup failed. The news provider rejected the request from this server. Continue without live news.';
    }
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
    async ({ mode, text }, config) => {
      const effectiveUserId = String(config?.metadata?.userId || config?.configurable?.userId || '').trim();
      const memoryText = String(text || '').trim().slice(0, 1000);

      if (!memoryText) {
        return "Error: longtermMemoryTool requires a valid 'text' parameter to store or retrieve information. Please provide it.";
      }
    
      if (!effectiveUserId) {
        return "Error: longtermMemoryTool requires the signed-in user.";
      }
    
    try {
      const vectors = await GenerateVector(memoryText);
      if (!Array.isArray(vectors) || !vectors.length) {
        return "Long-term memory is unavailable because no embedding was returned.";
      }
      if (mode === 'store') {
        const id = require('crypto').createHash('sha256').update(`${effectiveUserId}\n${memoryText.toLowerCase()}`).digest('hex');
        await ChatgptIndex.upsert(
          [
            {
              id,
              values: vectors,
              metadata: {
                user: effectiveUserId,
                msg: memoryText
              }
            }
          ]
        );
        return "Information stored successfully.";
      }
      else if (mode === 'retrieve') {
        const results = await ChatgptIndex.query({
          topK: 5,
          vector: vectors,
          includeMetadata: true,
          filter: {
            user: { $eq: effectiveUserId }
          }
        });
        const memories = (results.matches || [])
          .filter((match) => (match.score || 0) >= 0.4 && match.metadata?.msg)
          .map((match) => match.metadata.msg);
        if (!memories.length) return "No matching long-term memories.";
        return JSON.stringify(memories);
      }
      return "Error: longtermMemoryTool mode must be store or retrieve.";
    } catch (err) {
      const raw = String(err.message || err);
      console.error("Long-term memory tool error:", raw.slice(0, 300));
      if (/leaked|permission_denied|api key/i.test(raw)) {
        return "Long-term memory is unavailable because the embedding API key was rejected. Continue without it.";
      }
      return "Long-term memory failed. Continue without it.";
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
function shouldTrySmtp() {
  const flag = String(process.env.SMTP_ENABLED || '').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  // Render blocks outbound ports 25, 465, and 587. Gmail SMTP times out there.
  return process.env.RENDER !== 'true';
}

function gmailApiConfigured() {
  return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
    .every((name) => String(process.env[name] || '').trim());
}

async function gmailAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const response = await axios.post(
    'https://oauth2.googleapis.com/token',
    body.toString(),
    {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  if (!response.data?.access_token) {
    const err = new Error(response.data?.error_description || response.data?.error || 'could not refresh the Gmail token');
    err.status = response.status;
    throw err;
  }
  return response.data.access_token;
}

async function rawGmailMessage(fields) {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
    logger: false,
  });
  const info = await transport.sendMail(fields);
  return info.message.toString('base64url');
}

function getGmailTransporter() {
  if (!shouldTrySmtp() || !process.env.GMAIL_USER || !process.env.GMAIL_PASS) return null;
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
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
                              ? '<img src="cid:aastraalogo.png" width="280" alt="Aastraa AI" style="display: block; margin: 0 auto; max-width: 280px; height: auto; border: 0;">'
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
  for (const secret of [process.env.GMAIL_USER, process.env.RESEND_FROM, process.env.BREVO_SENDER]) {
    const value = String(secret || '').trim();
    if (value) safe = safe.split(value).join('the sending account');
  }
  return safe;
}

function providerError(label, error) {
  const status = error?.statusCode || error?.status || error?.response?.status;
  const raw = error?.message || error?.response?.data?.message || '';
  if (/not verified/i.test(String(raw))) {
    return `${label}: the sender is not verified for this provider`;
  }
  if (status === 403) {
    return `${label}: the provider refused the request (403)`;
  }
  return `${label}: ${hideConfiguredAddresses(raw || 'the provider did not accept the email')}`;
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
  const errors = [];
  const accepted = `Mail accepted for delivery to ${recipient}. Ask the user to check the inbox and spam folder. Do not mention the sending account, and do not say it arrived until they confirm they can see it.`;
  const resendFrom = verifiedResendFrom();

  if (gmailApiConfigured() && process.env.GMAIL_USER) {
    try {
      const raw = await rawGmailMessage({
        from: `${process.env.MAIL_FROM_NAME || 'Astra AI'} <${process.env.GMAIL_USER}>`,
        to: recipient,
        subject: emailSubject,
        text: body,
        html: getEmailTemplate(emailSubject, body, hasLogo),
        attachments: hasLogo ? [{ filename: 'aastraalogo.png', path: logoPath, cid: 'aastraalogo.png' }] : [],
      });
      const token = await gmailAccessToken();
      const response = await axios.post(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        { raw },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          timeout: 15000,
          validateStatus: () => true,
        }
      );
      if (response.status >= 200 && response.status < 300 && response.data?.id) {
        console.log('Email accepted by Gmail API:', response.data.id);
        return accepted;
      }
      const rejected = new Error(response.data?.error?.message || 'Gmail API rejected the message');
      rejected.status = response.status;
      throw rejected;
    } catch (err) {
      const detail = providerError('Gmail API', err);
      console.error(detail);
      errors.push(detail);
    }
  }

  if (resendFrom && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const data = await resend.emails.send({
        from: resendFrom,
        to: [recipient],
        subject: emailSubject,
        text: body,
        html: getEmailTemplate(emailSubject, body, hasLogo),
        attachments: logoData
          ? [{
              filename: 'aastraalogo.png',
              content: logoData.toString('base64'),
              contentType: 'image/png',
              contentId: 'aastraalogo.png',
            }]
          : undefined,
      });

      if (!data.error && data.data?.id) {
        console.log('Email accepted by Resend:', data.data.id);
        return accepted;
      }

      const detail = providerError('Resend', data.error);
      console.error(detail);
      errors.push(detail);
    } catch (err) {
      const detail = providerError('Resend', err);
      console.error(detail);
      errors.push(detail);
    }
  }

  const brevoKey = String(process.env.BREVO_API_KEY || '').trim();
  const brevoSender = String(process.env.BREVO_SENDER || process.env.GMAIL_USER || '').trim();
  if (brevoKey && brevoSender) {
    try {
      const response = await axios.post(
        process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email',
        {
          sender: {
            name: process.env.MAIL_FROM_NAME || 'Astra AI',
            email: brevoSender,
          },
          to: [{ email: recipient }],
          subject: emailSubject,
          textContent: body,
          htmlContent: getEmailTemplate(emailSubject, body, hasLogo),
          attachment: hasLogo
            ? [{
                name: 'aastraalogo.png',
                content: logoData.toString('base64'),
              }]
            : undefined,
        },
        {
          headers: {
            'api-key': brevoKey,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          timeout: 15000,
          validateStatus: () => true,
        }
      );

      if (response.status >= 200 && response.status < 300 && response.data?.messageId) {
        console.log('Email accepted by Brevo:', response.data.messageId);
        return accepted;
      }

      const detail = providerError('Brevo', {
        status: response.status,
        message: response.data?.message || response.data?.code,
      });
      console.error(detail);
      errors.push(detail);
    } catch (err) {
      const detail = providerError('Brevo', err);
      console.error(detail);
      errors.push(detail);
    }
  }

  if (!shouldTrySmtp()) {
    if (!gmailApiConfigured()) {
      errors.push('Gmail SMTP is blocked on this host. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to send with the free Gmail API');
    }
  } else {
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
          html: getEmailTemplate(emailSubject, body, hasLogo),
          attachments: hasLogo ? [{ filename: 'aastraalogo.png', path: logoPath, cid: 'aastraalogo.png' }] : [],
        });
        const acceptedTo = info.accepted || [];
        const rejected = info.rejected || [];
        if (!acceptedTo.length || rejected.length) {
          throw new Error('recipient was not accepted');
        }
        console.log('Email accepted by Gmail:', info.messageId);
        return accepted;
      }
    } catch (err) {
      const detail = providerError('Gmail', err);
      console.error(detail);
      errors.push(detail);
    }
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
