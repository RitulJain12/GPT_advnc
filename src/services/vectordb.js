const{Pinecone}=require("@pinecone-database/pinecone");
const pc = new Pinecone({ apiKey: process.env.PINE_CONE});

const ChatgptIndex=pc.Index(process.env.PINECONE_INDEX);


module.exports=ChatgptIndex;