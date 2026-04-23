namespace VideoChatApp.Backend.Models
{
    public class UserConnection
    {
        public string ConnectionId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
    }

    public class Room
    {
        public string RoomCode { get; set; } = string.Empty;
        public List<UserConnection> Users { get; set; } = new List<UserConnection>();
    }

    public class SignalMessage
    {
        public string TargetConnectionId { get; set; } = string.Empty;
        public string SenderConnectionId { get; set; } = string.Empty;
        public object Signal { get; set; } = new object();
    }

    public class ChatMessage
    {
        public string UserName { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
