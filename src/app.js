const express=require('express');
const app=express();
const cookieParser=require('cookie-parser');
app.use(cookieParser());
app.use(express.json());
const authRoutes=require('./routes/authRoutes');
const chatRoutes=require('../src/routes/ChatRoute');
const cors=require('cors');
const cors = require("cors");

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://your-frontend.onrender.com"
  ],
  credentials: true
}));


app.use('/api/auth',authRoutes);
app.use('/api/chat',chatRoutes);


module.exports=app;