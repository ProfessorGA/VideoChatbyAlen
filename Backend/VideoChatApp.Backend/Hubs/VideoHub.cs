using Microsoft.AspNetCore.SignalR;
using VideoChatApp.Backend.Models;
using VideoChatApp.Backend.Services;

namespace VideoChatApp.Backend.Hubs
{
    public class VideoHub : Hub
    {
        private readonly IRoomService _roomService;

        public VideoHub(IRoomService roomService)
        {
            _roomService = roomService;
        }

        public async Task CreateRoom()
        {
            var roomCode = _roomService.CreateRoom();
            await Clients.Caller.SendAsync("RoomCreated", roomCode);
        }

        public async Task JoinRoom(string roomCode, string userName)
        {
            if (_roomService.JoinRoom(roomCode, Context.ConnectionId, userName, out var error))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
                
                var room = _roomService.GetRoom(roomCode);
                // Notify others in the room
                await Clients.GroupExcept(roomCode, Context.ConnectionId).SendAsync("UserJoined", new { ConnectionId = Context.ConnectionId, UserName = userName });
                
                // Send the list of existing users to the new user (so they can initiate WebRTC connections)
                await Clients.Caller.SendAsync("JoinedRoom", room);
            }
            else
            {
                await Clients.Caller.SendAsync("Error", error);
            }
        }

        public async Task SendSignal(string targetConnectionId, object signal)
        {
            await Clients.Client(targetConnectionId).SendAsync("SignalReceived", new { SenderConnectionId = Context.ConnectionId, Signal = signal });
        }

        public async Task NotifyReady(string roomCode)
        {
            await Clients.OthersInGroup(roomCode).SendAsync("PeerReady", Context.ConnectionId);
        }

        public async Task NotifyAction(string roomCode, string action)
        {
            await Clients.OthersInGroup(roomCode).SendAsync("ActionNotification", Context.ConnectionId, action);
        }

        public async Task UpdateStatus(string roomCode, string status)
        {
            await Clients.OthersInGroup(roomCode).SendAsync("UserStatusUpdate", Context.ConnectionId, status);
        }

        public async Task SendMessage(string roomCode, string userName, string content)
        {
            await Clients.Group(roomCode).SendAsync("MessageReceived", new ChatMessage 
            { 
                UserName = userName, 
                Content = content 
            });
        }

        public async Task LeaveRoom(string roomCode)
        {
            _roomService.LeaveRoom(Context.ConnectionId, out _);
            await Clients.Group(roomCode).SendAsync("UserLeft", Context.ConnectionId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomCode);
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _roomService.LeaveRoom(Context.ConnectionId, out var roomCode);
            if (!string.IsNullOrEmpty(roomCode))
            {
                await Clients.Group(roomCode).SendAsync("UserLeft", Context.ConnectionId);
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomCode);
            }
            await base.OnDisconnectedAsync(exception);
        }
    }
}
