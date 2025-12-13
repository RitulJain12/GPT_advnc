const chatModel=require('../models/chat-model');
const MessageModel=require('../models/message');
const main=require('../services/ai-analyse');
const fs=require('fs');
async function createChat(req,res) {
    
    const {title}=req.body;
    const {user}=req;
   console.log("chat created");
    const chat=await chatModel.create({
        user:user._id,
        title
    });
    res.status(201).json({
        message:"Chat Created Successfully",
        chat:{
            id:chat._id,
            title:chat.title,
            lastActivity:chat.lastActivity
        }
    });
}


async function Deltchat(req,res) {
    
    const {id}=req.params;
   
   try{
    const chat=await chatModel.findByIdAndDelete(id);
    console.log(chat);
    
    res.status(200).json({
        message:"Chat Deleted Successfully",
       
    });
}
catch(err){
    res.status(404).json({
        message:"Error in chat deletion"
    })
}
}
async function updateTitle(req,res) {
    const { id } = req.params;

    const chat = await chatModel.findByIdAndUpdate(
      id,
      { title: req.body.title },
      { new: true } 
    );
    
    if (!chat) {
      return res.status(404).json({
        message: "Error in title updation"
      });
    }
    console.log(chat);
    res.status(200).json({
      message: "Title updated Successfully",
      chat
    });
    
}






async function getAllChats(req,res) {
    
    const chatList = await chatModel.find(
      {user:req.user._id}
    );
    
    if (!chatList) {
      return res.status(404).json({
        message: "Error in Finding chats"
      });
    }
    const chats= [];


    for (let cht of chatList) {
      const msgs = await MessageModel.find({ chat: cht._id }).select("-user -chat");
    
      chats.push({
        ...cht.toObject(),  // IMPORTANT
        messages: msgs
      });
    }
    
    console.log(chats);
    res.status(200).json({
      message: "Chats Fetched Successfully",
      chats
    });
    
}





async function Filehandler(req,res) {
 const {files}=req;
 const file=files[0];
  console.log(req.body);
  console.log(files[0]);
  const {msg}=req.body;
  const prompt=`You are a professional AI assistant. You will receive two inputs:

1.  The extracted text or description of the uploaded file/image (PDF, text file, document, image, etc.).
2.  The user’s query=>${msg}. It may be empty or undefined.

Your tasks:

- If user query IS PROVIDED:
    → Answer the question in a professional, concise, and accurate way based strictly on the file_content.
  
- If  user question  is EMPTY or NOT PROVIDED:
    → Do NOT create imaginary questions.
    → Instead, analyze the file/content and provide:
        * a summary,
        * description of what the file/image is about,
        * key insights.

- The final output MUST ALWAYS be a **valid JSON object**, using the following structure:

{
  "status": "success",
  "type": "answer" | "summary",
  "content": {
      "response": "Your professional answer or summary here"
  }
}

Rules:
- The JSON must never break. No trailing commas, no comments.
- Never include explanation outside of the JSON.
- Do not hallucinate—only use what is inside file_content.
- If file_content is unreadable or empty, respond with:

{
  "status": "error",
  "message": "Unable to interpret the provided file or image."
}
`
 try{
  let response= await main(prompt,file.buffer,file.mimetype);
  response=response.replace(/^```json\s*|```$/g,'').trim();
  const data=JSON.parse(response);
  console.log(data);
   res.status(201).json({
    msg: "Content Generated successfully",
    data
  });
 }
 catch(err){
  console.log(err);
  res.status(500).json({ msg: "Server error", error: err.message });
 }
}




module.exports={
    createChat,
    Deltchat,updateTitle,getAllChats,Filehandler
}