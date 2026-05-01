const express=require('express');
const app=express();
const cookieParser=require('cookie-parser');
const authRoutes=require('./routes/authRoutes');
const chatRoutes=require('../src/routes/ChatRoute');

const path=require('path');
const cors = require("cors");
app.use(express.static('./public'))

app.use(cookieParser());
app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://your-frontend.onrender.com", 
    "https://aasstraa-ai.netlify.app/",
    "https://aastraa.vercel.app" 
  ],
  credentials: true
}));
app.use(express.static(path.join(__dirname,'../public')))
 
app.use('/api/auth',authRoutes);
app.use('/api/chat',chatRoutes);
app.use('/api/health',(req,res)=>{
  res.status(200).json({
    message:"Server is Working"
  })
})

app.get("*name",(req,res)=>{
  res.sendFile(path.join(__dirname,'../public/index.html'));
}) 
module.exports=app; 