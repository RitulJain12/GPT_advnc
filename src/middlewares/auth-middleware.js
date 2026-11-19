const userModel =require('../models/user');
const jwt=require('jsonwebtoken');
require('dotenv').config();
module.exports.authUser= async(req,res,next)=>{
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const token = req.cookies?.token || bearer;

    if(!token || token === 'undefined' || token === 'null'){
    return   res.status(401).json({message:"Unauthorized"});
    }
    try{
        const decoded=jwt.verify(token,process.env.KEY);
        const user=await userModel.findById(decoded.id).select("-password");
        if (!user) return res.status(401).json({ message: "Unauthorized" });
        req.user=user;
        next();
         
    }
    catch(err){
        res.status(401).json({message:"Unauthorized"});
    }
}