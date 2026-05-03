const { Server } = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user');
const MessageModel = require('../models/message');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages')
const agent = require('../tools/agent')


function initSocketServer(httpserver) {
  const io = new Server(httpserver, {
    cors: {
      origin: [
        "http://localhost:5173",
        "https://gpt-advnc-1.onrender.com",
        "https://aasstraa-ai.netlify.app",
        "https://aastraa.vercel.app"
      ],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true
    }
  })







  io.use(async (socket, next) => {
    const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

    if (!cookies.token) {
      console.log('Socket auth failed: no token cookie');
      next(new Error("Unauthorized"));
    }
    try {
      const decoded = jwt.verify(cookies.token, process.env.KEY);
      console.log(decoded);
      const user = await userModel.findById(decoded.id);
      socket.user = user;
      socket.token = cookies.token;
      console.log(user);
      next();
    }
    catch (err) {
      console.log('Socket auth failed:', err.message || err);
      next(new Error(err));
    }

  })

  io.on('connection', (socket) => {

    socket.on("ai-message", async (msg) => {



      try {


        if (!msg || !msg.chatId || !msg.message) {
          console.error('Invalid message payload received', msg);
          return socket.emit('ai-message-error', { error: 'Invalid message payload' });
        }


        console.log(msg);

        const stream = await agent.streamEvents(
          {
            messages: [
              new SystemMessage(`You are Astra AI, an intelligent assistant created by Ritul Jain.
Current date: ${new Date().toLocaleDateString()}

Memory Rules:
- Use longtermMemoryTool to retrieve past info before answering.
- Store new user facts with mode="store".
- Be natural, don't mention tools.

Parameters: mode ("retrieve" or "store"), text (query or fact), userId ("${socket.user._id}")`),
              new HumanMessage(msg.message)

            ],

          },
          {
            version: "v2",
            configurable: {
              thread_id: msg.chatId.toString()
            },
            metadata: {
              token: socket.token
            }
          }
        );

        let finalResponse = "";

        for await (const event of stream) {
          const eventType = event.event;

          if (eventType === "on_chat_model_stream") {
            const chunk = event.data.chunk;
            if (chunk && chunk.content && typeof chunk.content === "string") {
              finalResponse += chunk.content;

              socket.emit("ai-message-chunk", {
                chunk: chunk.content,
                chatId: msg.chatId
              });
            }
          }
        }

        console.log(finalResponse);

        socket.emit("ai-message-response", {
          response: finalResponse,
          chatId: msg.chatId
        });


        const UserMsg = await MessageModel.create({
          chat: msg.chatId,
          user: socket.user._id,
          content: msg.message,
          role: 'user'
        });
        const Modelmsg = await MessageModel.create({
          chat: msg.chatId,
          user: socket.user._id,
          content: finalResponse,
          role: 'model'
        });
      }

      catch (err) {
        console.error("Error handling ai-message:", err);
        socket.emit('ai-message-error', { error: err.message });
      }

    });

  });

}

module.exports = initSocketServer;
