const { StateGraph, MessagesAnnotation, MemorySaver } = require("@langchain/langgraph");

const { ChatGroq } = require("@langchain/groq");

const { AIMessage, ToolMessage } = require("@langchain/core/messages");

const tools = require("./tools");


const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b", 
  temperature: 0.5,
  streaming: true, 
});


const graph = new StateGraph(MessagesAnnotation)

  .addNode("chat", async (state, config) => {
    const response = await model.invoke(state.messages, {
      tools: [tools.searchWeather, tools.TopNewsOfCity, tools.longtermMemoryTool, tools.webSearchTool, tools.emailSendTool],
    });

    console.log(response);

    return {
      messages: [
        ...state.messages,
        new AIMessage({
          content: response.content,
          tool_calls: response.tool_calls ?? [],
        }),
      ],
    };
  })


  .addNode("tools", async (state, config) => {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      throw new Error("Tools node hit without tool_calls");
    }

    const toolMessages = await Promise.all(
      lastMessage.tool_calls.map(async (call) => {
        const tool = tools[call.name];
        if (!tool) throw new Error(`Tool not found: ${call.name}`);

        const result = await tool.invoke(call.args, {
          metadata: {
            token: config.metadata.token,
          },
        });

        return new ToolMessage({
          content: result,
          tool_call_id: call.id,
        });
      })
    );

    return {
      messages: [...state.messages, ...toolMessages],
    };
  })


  .addEdge("__start__", "chat")
  .addConditionalEdges("chat", (state) => {
    const last = state.messages[state.messages.length - 1];
    return last.tool_calls && last.tool_calls.length > 0
      ? "tools"
      : "__end__";
  })
  .addEdge("tools", "chat");

const checkpointer = new MemorySaver();
const agent = graph.compile({ checkpointer });
module.exports = agent;
