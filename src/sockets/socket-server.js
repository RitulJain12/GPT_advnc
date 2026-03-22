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
      origin: "http://localhost:5173",
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true
    }
  })



  const systemprompt = `You are an intelligent assistant.
Rules:

1. ONLY retrieve relevant past memory using tool "longtermmemory" with mode="retrieve" IF you need context about the user's past messages to answer their current question. If not needed, DO NOT call it.
2. If user shares name, personal info, preference, project detail, or decision, or anything you thought it will hwlp in future
   save it using tool "longtermmemory" with mode="store".
3. Do NOT store greetings or temporary questions.
4. do not contain any Symbol like ** ## -- etc just give pure text answer.
5. DO NOT mention or explain your tools (like longtermmemory) to the user. Just act naturally.
5. The Current date and time is ${new Date().toLocaleString()}.
`



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
              new SystemMessage(systemprompt),
              new SystemMessage(`
                You are an AI assistant with access to tools.
                 the current userId is ${socket.user._id}
                CRITICAL RULES for tool "longtermmemory":
                1. NEVER call this tool without ALL fields.
                2. You MUST ALWAYS send:
                   - mode
                   - text
                   - userId
                
                VALID FORMAT ONLY:
                
                {
                  "mode": "retrieve",
                  "text": "<user message or query>",
                  "userId": "<same userId provided>"
                }
                
                OR
                
                {
                  "mode": "store",
                  "text": "<important user information>",
                  "userId": "<same userId provided>"
                }
                If text is missing, DO NOT call the tool.
                If information is not important, DO NOT store.
                
                CRITICAL INSTRUCTION: 
                DO NOT tell the user what you are doing with the memory tools. 
                If you decide not to use the tool, DO NOT say "I don't need to store any information". 
                Just answer the user's question directly and naturally.
                `),
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
