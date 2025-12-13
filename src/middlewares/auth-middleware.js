const userModel =require('../models/user');
const jwt=require('jsonwebtoken');
require('dotenv').config();
module.exports.authUser= async(req,res,next)=>{
    const {token}=req.cookies;
  
    if(!token){
    return   res.status(401).json({message:"Unauthorized"});
    }
    try{
        const decoded=jwt.verify(token,process.env.KEY);
        const user=await userModel.findById(decoded.id).select("-password");
        req.user=user;
        next();
         
    }
    catch(err){
        res.status(401).json({message:"Unauthorized"});
    }
}