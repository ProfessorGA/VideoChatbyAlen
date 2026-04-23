# Real-Time Video Chat App (SyncVideo)

A full-stack video chat application built with Angular 17, ASP.NET Core 8 SignalR, and WebRTC.

## Features
- Room-based video chat (up to 5 users).
- Real-time text chat.
- Mesh WebRTC architecture.
- In-memory server storage (no database required).
- Premium Glassmorphic UI.

## Local Setup

### Prerequisites
- .NET 8 SDK
- Node.js (v20.9.0+)
- npm

### 1. Run the Backend
```bash
cd Backend/VideoChatApp.Backend
dotnet run
```
The backend will start at `https://localhost:7068`.

### 2. Run the Frontend
```bash
cd Frontend
npm install
npm start
```
The frontend will start at `http://localhost:4200`.

## How to use
1. Open two different browser tabs at `http://localhost:4200`.
2. In the first tab, click **Create Room**.
3. Copy the generated room code.
4. Enter your name and click **Join Room**.
5. In the second tab, paste the room code, enter a different name, and click **Join Room**.
6. Enjoy the video chat!

## Deployment
See [DEPLOYMENT.md](DEPLOYMENT.md) for details on deploying to Render and Vercel.
