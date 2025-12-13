const userModel=require('../models/user');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
module.exports.registerUser= async(req,res)=>{
  let{fullName:{firstName,lastName},email,password}=req.body;
  password= await bcrypt.hash(password,10);
  try{
    const Isuser=await userModel.findOne({email});
    if(Isuser) return res.status(400).json({message:"User Already Exist"});
   const user=await userModel.create({
    fullName:{
        firstName,
        lastName
    },
    email,
    password,
   })
    const token=jwt.sign({id:user._id},process.env.KEY);
    res.cookie('token',token);
    res.status(201).json({
        message:"User Successfully Registered",
        user:{
            email:user.email,
            id:user._id,
            fullName:user.fullName
        }
    })
  }
  catch(err){
   console.log(err);
  }


}
module.exports.loginUser= async(req,res)=>{
    const{email,password}=req.body;
    if (!email || !password) {
      return  res.status(402).json({
            message:"Invalid Credentials"
        })
    }
    const user = await userModel.findOne({ email });
    if(!user) {
        return  res.status(402).json({
              message:"Invalid Credentials"
          })
      }
      const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(402).json({ message: "Invalid Credentials" });
    
      const token=jwt.sign({id:user._id},process.env.KEY);
      res.cookie("token", token, {
        httpOnly: true,
        secure: false,       
        sameSite: "lax",    
        path: "/",           //
        maxAge: 7 * 24 * 60 * 60 * 1000  
    });
    
      console.log("loging......");
      res.status(200).json({
          message:"User Successfully Logedin",
          user:{
              email:user.email,
              id:user._id,
              fullName:user.fullName
          }
      })
  
  }

 
    
  module.exports.logOut= async(req,res)=>{
  
      const {token}=req.cookies;
      if(!token) return res.status(404).json({
        "message":"your already logedOut"
      })
      res.cookie("token", "", {
        httpOnly: true,
        expires: new Date(0),
        secure: true,
        sameSite: "none"
      });
    
      res.status(200).json({
          message:"User Successfully LogeOut",
      })
  
  }

 
    
