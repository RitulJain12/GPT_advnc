const { Server } = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user');
const MessageModel = require('../models/message');
const chatModel = require('../models/chat-model');
const { HumanMessage, AIMessage } = require('@langchain/core/messages')
const agent = require('../tools/agent')
const { clientOrigins } = require('../config/env');

function textFromChunk(chunk) {
  if (!chunk) return '';
  const content = chunk.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      return '';
    }).join('');
  }
  return '';
}


async function savedMessages(config) {
  try {
    const snapshot = await agent.getState(config);
    const messages = snapshot?.values?.messages;
    return Array.isArray(messages) ? messages : [];
  } catch (err) {
    console.error('Could not read short-term memory:', err.message || err);
    return [];
  }
}

function messageText(message) {
  return textFromChunk(message).trim();
}

async function shortTermHistory(chatId, userId) {
  const history = await MessageModel.find({ chat: chatId, user: userId })
    .sort({ createdAt: 1 })
    .limit(40)
    .lean();

  return history
    .filter((item) => item.content && String(item.content).trim())
    .map((item) => (
      item.role === 'user'
        ? new HumanMessage(String(item.content))
        : new AIMessage(String(item.content))
    ));
}

function initSocketServer(httpserver) {
  const io = new Server(httpserver, {
    cors: {
      origin: clientOrigins(),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true
    }
  })







  io.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers?.cookie || "");
      const handshakeToken = socket.handshake.auth?.token;
      const token = cookies.token || (
        handshakeToken && handshakeToken !== 'undefined' && handshakeToken !== 'null'
          ? handshakeToken
          : null
      );

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, process.env.KEY);
      const user = await userModel.findById(decoded.id).select('-password');
      if (!user) return next(new Error("Unauthorized"));

      socket.user = user;
      socket.token = token;
      return next();
    }
    catch (err) {
      console.log('Socket auth failed:', err.message || err);
      return next(new Error("Unauthorized"));
    }

  })

  io.on('connection', (socket) => {

    socket.on("ai-message", async (msg) => {



      try {


        if (!msg || !msg.chatId || !msg.message) {
          console.error('Invalid message payload received', msg);
          return socket.emit('ai-message-error', { error: 'Invalid message payload', chatId: msg?.chatId });
        }

        const chat = await chatModel.findOne({ _id: msg.chatId, user: socket.user._id }).select('_id');
        if (!chat) {
          return socket.emit('ai-message-error', { error: 'Chat not found', chatId: msg.chatId });
        }

        const threadConfig = {
          version: "v2",
          configurable: {
            thread_id: msg.chatId.toString(),
            token: socket.token,
            userId: socket.user._id.toString()
          },
          metadata: {
            token: socket.token,
            userId: socket.user._id.toString()
          }
        };

        const remembered = await savedMessages(threadConfig);
        const prior = remembered.length ? [] : await shortTermHistory(msg.chatId, socket.user._id);

        const stream = await agent.streamEvents(
          {
            messages: [...prior, new HumanMessage(msg.message)],
          },
          threadConfig
        );

        let finalResponse = "";
        let runId = null;
        let runText = "";
        let runHasTools = false;

        const commitRun = () => {
          if (!runHasTools && runText) finalResponse += runText;
          runText = "";
          runHasTools = false;
        };

        for await (const event of stream) {
          if (event.event !== "on_chat_model_stream") continue;
          if (event.run_id !== runId) {
            commitRun();
            runId = event.run_id;
          }
          const chunk = event.data?.chunk;
          if (chunk?.tool_call_chunks?.length || chunk?.tool_calls?.length) {
            runHasTools = true;
            continue;
          }
          const text = textFromChunk(chunk);
          if (!text || runHasTools) continue;
          runText += text;
          socket.emit("ai-message-chunk", {
            chunk: text,
            chatId: msg.chatId
          });
        }
        commitRun();

        const after = await savedMessages(threadConfig);
        for (let i = after.length - 1; i >= 0; i--) {
          const item = after[i];
          const type = typeof item._getType === 'function' ? item._getType() : item.type;
          const hasTools = Array.isArray(item.tool_calls) && item.tool_calls.length > 0;
          if ((type === 'ai' || type === 'assistant') && !hasTools) {
            const text = messageText(item);
            if (text) finalResponse = text;
            break;
          }
        }

        socket.emit("ai-message-response", {
          response: finalResponse,
          chatId: msg.chatId
        });

        await MessageModel.create({
          chat: msg.chatId,
          user: socket.user._id,
          content: msg.message,
          role: 'user'
        });
        if (finalResponse.trim()) {
          await MessageModel.create({
            chat: msg.chatId,
            user: socket.user._id,
            content: finalResponse,
            role: 'model'
          });
        }
        await chatModel.findByIdAndUpdate(msg.chatId, { lastActivity: new Date() });
      }

      catch (err) {
        console.error("Error handling ai-message:", err);
        socket.emit('ai-message-error', { error: err.message || 'The assistant failed to respond.', chatId: msg?.chatId });
      }

    });

  });

}

module.exports = initSocketServer;
