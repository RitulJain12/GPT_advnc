const {Schema, default: mongoose}=require('mongoose');
const { type } = require('os');
const MessageSchema=new Schema({
      user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'user'
      },
      chat:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"chat"
      },
      content:{
        type:String,
        required:true
      },
      role:{
    type:String,
    enum:["user","model"],
    default:"user"
        
      }

},{
    timestamps:true
})
const MessageModel= mongoose.model('msg',MessageSchema);
module.exports=MessageModel;