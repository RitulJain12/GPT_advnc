const express=require('express');
const app=express();
const cookieParser=require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/ChatRoute');
const bucket = require('./services/tockenbucket');

const path=require('path');
const cors = require("cors");

app.use((req, res, next) => {
  if (!bucket.allowRequest()) {
    return res.status(429).json({
      message: "Too Many Requests"
    });
  }
  next();
});

app.use(express.static('./public'));
app.use(cookieParser());
app.use(express.json());
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:2130",
  "https://gpt-advnc-1.onrender.com",
  "https://aasstraa-ai.netlify.app",
  "https://aastraa.vercel.app"
];

app.use(cors({
  origin: allowedOrigins,
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