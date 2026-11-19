const { Server } = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user');
const MessageModel = require('../models/message');
const chatModel = require('../models/chat-model');
const { HumanMessage } = require('@langchain/core/messages')
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

        const stream = await agent.streamEvents(
          {
            messages: [
              new HumanMessage(msg.message)
            ],
          },
          {
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
          }
        );

        let finalResponse = "";

        for await (const event of stream) {
          if (event.event !== "on_chat_model_stream") continue;
          const text = textFromChunk(event.data?.chunk);
          if (!text) continue;

          finalResponse += text;
          socket.emit("ai-message-chunk", {
            chunk: text,
            chatId: msg.chatId
          });
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
