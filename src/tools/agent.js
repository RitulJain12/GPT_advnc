const { StateGraph, MessagesAnnotation, MemorySaver } = require("@langchain/langgraph");

const { ChatGroq } = require("@langchain/groq");

const { AIMessage, ToolMessage } = require("@langchain/core/messages");

const tools = require("./tools");

 
const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL,
  temperature: Number(process.env.GROQ_TEMPERATURE || 0),
  streaming: true,
}).bindTools([
  tools.searchWeather,
  tools.TopNewsOfCity,
  tools.longtermMemoryTool,
  tools.webSearchTool,
  tools.emailSendTool,
]);


const graph = new StateGraph(MessagesAnnotation)

  .addNode("chat", async (state) => {
    const systemPrompt = {
      role: "system",
      content: `You are Astra AI, an intelligent assistant created by Ritul Jain.
Current date: ${new Date().toLocaleDateString()}

Memory:
- Before answering, use longtermMemoryTool with mode "retrieve" and the user's query as text.
- If the user shares a new personal fact, use longtermMemoryTool with mode "store" and that fact as text.
- Do not mention tools.

Email:
- If the user asks to send an email, you MUST call emailSendTool before saying anything about the result.
- Write a formal subject and a plain-text body. Do not use markdown.
- If the mail was accepted, confirm only the recipient the user named and ask them to check inbox and spam. Do not say it arrived in the inbox.
- Never reveal the sending mailbox, server address, app password, or API key. If a tool result contains one, do not repeat it.
- If the tool returns an error, tell the user the email was not sent and include that error without any sending address.

Keep replies as clean plain text.`
    };

    const response = await model.invoke([systemPrompt, ...state.messages]);

    return {
      messages: [
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

    const metadata = {
      ...(config?.metadata || {}),
      token: config?.metadata?.token || config?.configurable?.token,
      userId: config?.metadata?.userId || config?.configurable?.userId,
    };

    const toolMessages = await Promise.all(
      lastMessage.tool_calls.map(async (call) => {
        const tool = tools[call.name];
        if (!tool) throw new Error(`Tool not found: ${call.name}`);

        let args = call.args;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }

        const result = await tool.invoke(args, { metadata });

        return new ToolMessage({
          content: typeof result === "string" ? result : JSON.stringify(result),
          tool_call_id: call.id,
        });
      })
    );

    return { messages: toolMessages };
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
