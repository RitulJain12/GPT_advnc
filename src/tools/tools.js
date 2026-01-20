const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");


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

module.exports = {
  searchWeather,
  TopNewsOfCity
};
