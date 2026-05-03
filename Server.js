require('dotenv').config();
const app=require('./src/app');
const morgan=require('morgan');
app.use(morgan('dev'));

const ConnectDB=require('./src/db/db');

const initSocketServer=require('./src/sockets/socket-server');


const httpserver=require('http').createServer(app);
  ConnectDB().then(()=>{
    initSocketServer(httpserver)
    httpserver.listen(process.env.PORT,()=>{
        console.log("Connected");
      });
      
  }).catch(err=>console.log(err));
  


