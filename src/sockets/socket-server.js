const { Server } = require('socket.io');
const cookie=require('cookie');
const jwt=require('jsonwebtoken');
const userModel=require('../models/user');
const {GenerateVector,GenerateResponse}=require('../services/ai-service');
const MessageModel=require('../models/message');
const { chat } = require('@pinecone-database/pinecone/dist/assistant/data/chat');
const {HumanMessage,SystemMessage,AIMessage}=require('@langchain/core/messages')
const agent=require('../tools/agent')
function initSocketServer(httpserver){
 const io=new Server(httpserver,{
   cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST","PUT","PATCH","DELETE"],
      credentials: true
    }
 }) 
 const systemprompt=`You are an intelligent assistant.

Rules:
1. Before answering, retrieve relevant past memory using tool "longtermmemory" with mode="retrieve".
2. If user shares personal info, preference, project detail, or decision,
   save it using tool "longtermmemory" with mode="store".
3. Do NOT store greetings or temporary questions.
4. do not contain any Symbol like ** ## -- etc just give pure text answer.
5. The Current date and time is ${new Date().toLocaleString()}.
`



 io.use(async(socket,next)=>{
      const cookies=cookie.parse(socket.handshake.headers?.cookie||"");
      if(!cookies.token){
       console.log('Socket auth failed: no token cookie');
       next(new Error("Unauthorized"));
      }
      try{
        const decoded=jwt.verify(cookies.token,process.env.KEY);
         const user=await userModel.findById(decoded.id);
         socket.user=user;
         socket.token = cookies.token; // save token for later use by agent
      // console.log(user._id);
         next();
      }
      catch(err){
          console.log('Socket auth failed:', err.message || err);
          next(new Error(err));
      }

 }) 

 io.on('connection',(socket)=>{
  
     socket.on("ai-message",async (msg)=>{
   
     
      
     try{
      
      
      if(!msg || !msg.chatId || !msg.message){
        console.error('Invalid message payload received', msg);
        return socket.emit('ai-message-error',{error:'Invalid message payload'});
      }

      
    
     
      const result = await agent.invoke(
        {
          messages: [
              new SystemMessage(systemprompt),
              new HumanMessage(`
                You are an AI assistant with access to tools.
                userid:${socket.user._id}
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
                `),
              new HumanMessage(msg.message) 

          ] 
        },
        {
          metadata: {
            token: socket.token    
          }
        }
      );

      
    


      socket.emit("ai-message-response",{
        response:result.messages[result.messages.length - 1].content,
        chatId:msg.chatId});
      
      
        const UserMsg = await MessageModel.create({
          chat:msg.chatId,
          user:socket.user._id,
          content:msg.message,
          role:'user'
        });
        const Modelmsg = await MessageModel.create({
          chat:msg.chatId,
          user:socket.user._id,
          content:result.messages[result.messages.length - 1].content,
          role:'model'
        });
     }

      catch(err){
        console.error("Error handling ai-message:", err);
        socket.emit('ai-message-error',{error:err.message});
      }
    
    }); 

  }); 

} 

module.exports=initSocketServer;
