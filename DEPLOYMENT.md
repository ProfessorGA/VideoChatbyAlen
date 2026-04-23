# Production Deployment Guide

This guide explains how to deploy your Video Chat App for free using Render (Backend) and Vercel (Frontend).

## 1. Prepare for Deployment

### Backend (Render)
1. **GitHub**: Push the entire `VideoChatApp` project to a **Public GitHub Repository**.
2. **Render Dashboard**: 
   - Click **New +** -> **Web Service**.
   - Connect your GitHub repository.
3. **Settings**:
   - **Name**: `videochatapp-backend` (or your choice).
   - **Root Directory**: `Backend/VideoChatApp.Backend`
   - **Language**: `Docker`
4. **Environment Variables**:
   - Add `ASPNETCORE_ENVIRONMENT`: `Production`
5. **Deploy**: Render will build the Dockerfile and provide a URL (e.g., `https://videochatapp-backend.onrender.com`).

### Frontend (Vercel)
1. **Configure URL**: Update `Frontend/src/environments/environment.prod.ts` with your **actual Render URL** (replace `videochatapp-backend.onrender.com` if yours is different).
2. **Vercel Dashboard**:
   - Click **Add New** -> **Project**.
   - Select your GitHub repository.
3. **Settings**:
   - **Framework Preset**: Angular.
   - **Root Directory**: `Frontend`
   - **Output Directory**: `dist/video-chat-app-frontend/browser` (Verify this in your `angular.json` after build).
4. **Deploy**: Vercel will build and deploy your app.

## 2. Handling CORS

In production, the backend must explicitly allow the Vercel URL.
I have configured the backend to allow any origin for the demo, but for production, you should update `Program.cs`:

```csharp
builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll", builder => builder
        .WithOrigins("https://your-vercel-app-url.vercel.app") // Add your Vercel URL here
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials());
});
```

## 3. WebRTC & HTTPS
- Both Vercel and Render provide **HTTPS** by default.
- WebRTC **requires** HTTPS for camera/microphone access.
- Our STUN server (`stun:stun.l.google.com:19302`) works across the public internet.

## 4. SignalR & WebSockets
- Render's free tier supports WebSockets.
- If the connection falls back to Long Polling, it will still work, but WebSockets are preferred for performance.
