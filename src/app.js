const express=require('express');
const app=express();
const cookieParser=require('cookie-parser');
app.use(cookieParser());
app.use(express.json());
const authRoutes=require('./routes/authRoutes');
const chatRoutes=require('../src/routes/ChatRoute');
const path=require('path');
const cors = require("cors");

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://your-frontend.onrender.com"
  ],
  credentials: true
}));
app.use(express.static(path.join(__dirname,'../public')))

app.use('/api/auth',authRoutes);
app.use('/api/chat',chatRoutes);

app.get("*name",(req,res)=>{
  res.sendFile(path.join(__dirname,'../public/index.html'));
})
module.exports=app;