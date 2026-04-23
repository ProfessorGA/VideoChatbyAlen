using System.Collections.Concurrent;
using VideoChatApp.Backend.Models;

namespace VideoChatApp.Backend.Services
{
    public interface IRoomService
    {
        string CreateRoom();
        bool JoinRoom(string roomCode, string connectionId, string userName, out string error);
        Room? GetRoom(string roomCode);
        Room? GetRoomByConnectionId(string connectionId);
        void LeaveRoom(string connectionId, out string? roomCode);
    }

    public class RoomService : IRoomService
    {
        private readonly ConcurrentDictionary<string, Room> _rooms = new();
        private readonly ConcurrentDictionary<string, string> _userToRoom = new();
        private const int MaxUsers = 5;

        public string CreateRoom()
        {
            string roomCode;
            do
            {
                roomCode = Guid.NewGuid().ToString("N").Substring(0, 6).ToUpper();
            } while (_rooms.ContainsKey(roomCode));

            _rooms.TryAdd(roomCode, new Room { RoomCode = roomCode });
            return roomCode;
        }

        public bool JoinRoom(string roomCode, string connectionId, string userName, out string error)
        {
            error = string.Empty;
            if (!_rooms.TryGetValue(roomCode, out var room))
            {
                error = "Room not found.";
                return false;
            }

            if (room.Users.Count >= MaxUsers)
            {
                error = "Room is full.";
                return false;
            }

            room.Users.Add(new UserConnection { ConnectionId = connectionId, UserName = userName });
            _userToRoom.TryAdd(connectionId, roomCode);
            return true;
        }

        public Room? GetRoom(string roomCode)
        {
            _rooms.TryGetValue(roomCode, out var room);
            return room;
        }

        public Room? GetRoomByConnectionId(string connectionId)
        {
            if (_userToRoom.TryGetValue(connectionId, out var roomCode))
            {
                return GetRoom(roomCode);
            }
            return null;
        }

        public void LeaveRoom(string connectionId, out string? roomCode)
        {
            roomCode = null;
            if (_userToRoom.TryRemove(connectionId, out roomCode))
            {
                if (_rooms.TryGetValue(roomCode, out var room))
                {
                    var user = room.Users.FirstOrDefault(u => u.ConnectionId == connectionId);
                    if (user != null)
                    {
                        room.Users.Remove(user);
                    }

                    if (room.Users.Count == 0)
                    {
                        _rooms.TryRemove(roomCode, out _);
                    }
                }
            }
        }
    }
}
