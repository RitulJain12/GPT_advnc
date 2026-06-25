# AI Agent Backend Service

This project is a robust Node.js backend that provides an intelligent AI assistant capable of various actions, real-time communication, and user management.

## Features

- **User Authentication**: Secure user registration, login, and logout functionalities utilizing `bcrypt` for password hashing and `jsonwebtoken` (JWT) for secure, stateless sessions.
- **Real-Time Communication**: Integrates `Socket.io` to provide real-time, low-latency communication between the client and the AI agent.
- **AI Integration**: Powered by `@google/genai` and `@langchain/core`, the agent can comprehend queries, remember past interactions, and determine which tool to execute.
- **Vector Database (Long-Term Memory)**: Connects to `@pinecone-database/pinecone` to store user facts and retrieve them contextually, providing the AI with long-term memory capabilities.
- **Web Search**: Uses `@tavily/core` to search the web for up-to-date information dynamically.
- **External Tools**: The AI can fetch the weather, top news for a specific city, and even send professional emails via `Resend`.
- **Database**: Uses `mongoose` for storing structured data like user profiles in MongoDB.

## Technologies Used

- **Node.js** & **Express** - Core server framework.
- **Socket.io** - WebSockets for real-time chat.
- **MongoDB** & **Mongoose** - Database and object data modeling.
- **LangChain** & **Google GenAI** - AI agent logic and language model interactions.
- **Pinecone** - Vector database for semantic search and long-term memory.
- **Resend** - HTTP-based email delivery service (bypasses hosting provider SMTP blocks).
- **Tavily API** - AI-optimized web search.

## Environment Variables

Make sure to set up your `.env` file with the following configurations:

- `PORT` - Server port.
- `KEY` - JWT secret key.
- `RESEND_API_KEY` - API key for the Resend email service.
- `TAVILY_API_KEY` - API key for Tavily web search.
- API keys for Google GenAI, Pinecone, and MongoDB connection string.

## Recent Updates

- **Error Handling**: Added robust `try/catch` blocks in the authentication controllers (`register`, `login`, `logout`) to prevent server crashes on unhandled promises and provide clear 500 status responses to the client.
- **Production Email Fix**: Replaced Nodemailer with the `Resend` API. Render's Free tier blocks all outbound SMTP requests (ports 25, 465, 587), causing timeout errors. Using Resend fixes this by sending emails over standard HTTPS.
