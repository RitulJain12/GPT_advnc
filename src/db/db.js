const mongoose=require('mongoose');
require('dotenv').config();
async function Dbconnect() {
    try{
        await mongoose.connect(process.env.DATABASE)
        console.log("Connected to DB");
    }
    catch(err){
        console.log("Database connection failed:", err);
        throw err;
    }
}
module.exports=Dbconnect;