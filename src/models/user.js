const {Schema, default: mongoose}=require('mongoose');
const { type } = require('os');
const UserSchema=new Schema({

      email:{
        type:String,
        required:true,
        unique:true,
      },
      fullName:{
        firstName:{
            type:String,
            required:true
        }, lastName:{
            type:String,
            required:true
        }
      },
      password:{
        type:String,
      }

},{
    timestamps:true
})
const userModel= mongoose.model('user',UserSchema);
module.exports=userModel;