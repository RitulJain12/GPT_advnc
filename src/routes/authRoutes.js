const express=require('express');
const router=express.Router();
const{registerUser,loginUser,logOut}=require('../controllers/auth_controller');


router.post('/register',registerUser);
router.post('/login',loginUser);
router.get('/logout',logOut);



module.exports=router;