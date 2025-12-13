const express=require('express');
const router=express.Router();
const {authUser}=require('../middlewares/auth-middleware');
const {createChat,Deltchat,updateTitle,getAllChats,Filehandler}=require('../controllers/chat_controller');
const multer=require('multer');

const storage =multer.memoryStorage();
const upload=multer({storage, limits: { fileSize: 50 * 1024 * 1024 }});
router.get('/',authUser,getAllChats)
router.post('/create',authUser,createChat);
router.delete('/:id',authUser,Deltchat);
router.put('/:id',authUser,updateTitle)
router.post('/upload-files',upload.array("files"),Filehandler)
module.exports=router;