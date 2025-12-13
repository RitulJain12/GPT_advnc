const{Pinecone}=require("@pinecone-database/pinecone");
const pc = new Pinecone({ apiKey: process.env.PINE_CONE});

const ChatgptIndex=pc.Index('chatgpt');

async function createMemory({vectors,msgId,metadata}) {
    await ChatgptIndex.upsert([
        {
            id:msgId,
            values:vectors,
            metadata
        }
    ])
}
async function queryMemory({queryVector,limit=5,metadata}) {
     const data= await ChatgptIndex.query({
        topK:limit,
        vector:queryVector,
        filter:metadata?{user:metadata.user}:undefined,
        includeMetadata:true
     })
     return data.matches;
}

module.exports=
{
    createMemory,
    queryMemory
}