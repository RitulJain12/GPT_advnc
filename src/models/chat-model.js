const {Schema, default: mongoose}=require('mongoose');
const { type } = require('os');
const ChatSchema=new Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'user',
        required:true
    },
    title:{
        type:String,
        required:true
    },
    lastActivity:{
        type:Date,
        default:Date.now()
    }
},{
    timestamps:true
})
const chatModel= mongoose.model('chat',ChatSchema);
module.exports=chatModel;