const { Server } = require('socket.io');
const cookie=require('cookie');
const jwt=require('jsonwebtoken');
const userModel=require('../models/user');
const {GenerateVector,GenerateResponse}=require('../services/ai-service');
const MessageModel=require('../models/message');
const { chat } = require('@pinecone-database/pinecone/dist/assistant/data/chat');
const {HumanMessage,SystemMessage,AIMessage}=require('@langchain/core/messages')
const agent=require('../tools/agent')
const systemPrompt = `
Rules:

3. If the user asks in Hinglish, respond in Hinglish.
4.Dont add Any Smybols like ** # noting Give in Only pure Language
Strictly Dont add any Symbol 
5.For Multiple Questions Asked Their Ans should be Properly Arranged
6.Dont Give Output in Hindi If user Talk in Natural Language Give output in HINGLISH but not in hindi
`;
function initSocketServer(httpserver){
 const io=new Server(httpserver,{
   cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST","PUT","PATCH","DELETE"],
      credentials: true
    }
 }) 
   const{createMemory,queryMemory}=require('../services/vectordb')
 io.use(async(socket,next)=>{
      const cookies=cookie.parse(socket.handshake.headers?.cookie||"");
      if(!cookies.token){
       next(new Error("Unauthorized"));
      }
      try{
        const decoded=jwt.verify(cookies.token,process.env.KEY);
         const user=await userModel.findById(decoded.id);
         socket.user=user;
       console.log(user._id);
         next();
      }
      catch(err){
          next(new Error(err));
      }

 }) 

 io.on('connection',(socket)=>{
  
     socket.on("ai-message",async (msg)=>{
   
      const[UserMsg, vectors]=await Promise.all([
        MessageModel.create({
          chat:msg.chatId,
          user:socket.user._id,
          content:msg.message,
         
       }),
       GenerateVector(msg.message)
      ])
      
     
         const Memory=await queryMemory({
            queryVector:vectors,
            limit:20,
            metadata:{user:socket.user._id}
           })
         
         await   createMemory({
            vectors,
            msgId:UserMsg._id,
            metadata:{
               chat:msg.chatId,
               user:socket.user._id,
               msg:msg.message,
               role:"user"
            }
           }) 
         
         const ChatHistory= (await MessageModel.find({chat:msg.chatId}).sort({createdAt:-1}).limit(5).lean()).reverse();

         const ShortMemory = ChatHistory.map(item => {
          if (item.role === "user") {
            return new HumanMessage(item.content);
          } else {
            return new AIMessage(item.content);
          }
        });
      
      
          const ltm=Memory.map(
             item=>{
              const role=item.metadata.role;
              if(role==="user"){
                return new HumanMessage(item.metadata.msg);
              }
              else{
                return new AIMessage(item.metadata.msg);
              }
             }
          );

     
        const result = await agent.invoke(
          {
            messages: [
                new SystemMessage(`You are an  Astra AI assistant helping the user based on the provided context from previous messages and relevant information. Use the context to generate accurate and helpful responses.Any Questions related to your identity or creator, respond that you are Astra AI created by Ritul Jain and give good intro of ritul jain as a professional that he is doing btech have a grt interest in ai and all he is in prefinal year.3. If the user asks in Hinglish, respond in Hinglish.
4.Dont add Any Smybols like ** # noting Give in Only pure Language
Strictly Dont add any Symbol 
5.For Multiple Questions Asked Their Ans should be Properly Arranged
6.Dont Give Output in Hindi If user Talk in Natural Language Give output in HINGLISH but not in hindi

 `),
                 ...ltm,
                 ...ShortMemory,
              new HumanMessage(msg.message)

            ] 
          },
          {
            metadata: {
              token: socket.token 
            }
          }
        );
        console.
       log("Agent response:", result); 
        socket.emit("ai-message-response",{
          response:result.messages[result.messages.length - 1].content,
          chatId:msg.chatId});
        const [Modelmsg,ResponseVectors]=await Promise.all([
          MessageModel.create({
            chat:msg.chatId,
            user:socket.user._id,
            content:result.messages[result.messages.length - 1].content,
            role:'model'
         }),
         GenerateVector(result.messages[result.messages.length - 1].content)
        ])
     
         await createMemory({
            vectors: ResponseVectors,
            msgId:Modelmsg._id,
            metadata:{
               chat:msg.chatId,
               user:socket.user._id,
               msg:result.messages[result.messages.length - 1].content,
               role:"model"
   
            }
           })
        
     })

 })
}

module.exports=initSocketServer;