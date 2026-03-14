const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { v4: uuidv4 } = require('uuid');
const axios = require("axios");
const ChatgptIndex=require('../services/vectordb');
const GenerateVector=require('../services/ai-service').GenerateVector;
const { tavily } = require('@tavily/core');
const searchWeather = tool(
  async ({ city }, config) => {
    const token = config.metadata.token;

    const response = await axios.get(
      `https://api.weatherapi.com/v1/current.json?key=2e8d6b81d55e4511be3100050251808&q=${city}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return JSON.stringify(response.data);
  },
  {
    name: "searchWeather",
    description: "Search Weather using a city as a string",
    schema: z.object({
      city: z.string().describe("Search keyword"),
    }),
  }
);

const TopNewsOfCity = tool(
  async ({ city}, config) => {
//const token = config.metadata.token;
   //// if(quantity>stock) throw Error('The Quantity Of Product Exceeds the Stock')
   console.log(city);
 const res=   await axios.get(
      `https://newsapi.org/v2/everything?q=${city}&apiKey=0e0fac0115ca4157b70faf01e30adb1f`
    );
      //console.log(res.data.articles)
      const news=[];
    for(let i=0;i<=10;i++){
      news.push(res.data?.articles[i]?.description||"NOT FOUND");
    }
   
    return  JSON.stringify(news);
  },
  {
    name: "TopNewsOfCity",
    description: "Gives Top News Of City",
    schema: z.object({
      city:z.string().describe(`The Name of the City for which News to be find`)
    }),
  }
);

const longtermMemoryTool = tool(
  

    async ({ mode, text, userId }) => {

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new Error(" longtermMemoryTool: text is missing or invalid");
      }
    
      if (!userId) {
        throw new Error(" longtermMemoryTool: userId is required");
      }
     
    
    
    const vectors= await GenerateVector(text);
    if(mode==='store'){
   
     await ChatgptIndex.upsert(
      [
         {
          id:uuidv4(),  
           values:vectors,
           metadata:{
            user:userId, 
            msg:text
         }}
      ]
     );
      return "Information stored successfully.";
    }
    else if(mode==='retrieve'){
      const results= await ChatgptIndex.query({
        topK:5,
        vector:vectors,
        includeMetadata:true, 
        filter:{
          user:userId
        }
      });
      return JSON.stringify(results.matches.map((match)=>match.metadata.msg));
    } 

  },{
    name:"longtermMemoryTool",
    description:"use this tool to store and retrieve information from longterm memory",
    schema:z.object({
      mode:z.enum(['store','retrieve']).describe('store or retrieve information from longterm memory'),
      text:z.string().describe('The text to store or retrieve'),
      userId:z.string().describe('The ID of the user')
    })
  }
);

const webSearchTool = tool(async ({query})=>{
  
  const client = tavily({ apiKey: "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" });
    const ans= await client.search(query, {
      searchDepth: "advanced"
  })
 
   console.log(`ansis : `,ans);
   return JSON.stringify(ans);
},{
  name:"webSearchTool",
  description:"use this tool to search the query on web",
  schema:z.object({
    query:z.string().describe('query that needs to be search in webtool')
  })
})


 

module.exports = {
  searchWeather,
  TopNewsOfCity,
  longtermMemoryTool,
  webSearchTool
};
