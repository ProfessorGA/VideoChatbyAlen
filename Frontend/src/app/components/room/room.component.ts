import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SignalrService } from '../../services/signalr.service';
import { WebrtcService } from '../../services/webrtc.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface RemotePeer {
  stream: MediaStream;
  userName: string;
}

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './room.component.html',
  styleUrl: './room.component.css'
})
export class RoomComponent implements OnInit, OnDestroy {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  
  roomCode: string = '';
  userName: string = '';
  localStream: MediaStream | null = null;
  remoteStreams: Map<string, RemotePeer> = new Map();
  
  messages: any[] = [];
  newMessage: string = '';
  isChatOpen: boolean = false;
  unreadMessages: number = 0;
  
  isAudioOn: boolean = true;
  isVideoOn: boolean = true;
  isMirrored: boolean = true;
  showSettings: boolean = false;
  
  cameras: MediaDeviceInfo[] = [];
  microphones: MediaDeviceInfo[] = [];
  selectedCamera: string = '';
  selectedMic: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private signalrService: SignalrService,
    private webrtcService: WebrtcService
  ) {
    const nav = this.router.getCurrentNavigation();
    if (nav?.extras.state) {
      this.userName = nav.extras.state['userName'];
    }
  }

  async ngOnInit(): Promise<void> {
    this.roomCode = this.route.snapshot.params['code'];
    
    if (!this.userName) {
      // If user refreshed or navigated directly, redirect to home
      this.router.navigate(['/']);
      return;
    }

    try {
      this.localStream = await this.webrtcService.getLocalStream();
      await this.loadDevices();
    } catch (err) {
      console.error('Could not get local stream', err);
      alert('Camera and Microphone access are required.');
    }

    this.setupSignalRHandlers();
    this.setupWebRTCHandlers();
  }

  private setupSignalRHandlers(): void {
    // When a new user joins, we (the existing users) initiate a connection to them
    this.signalrService.userJoined$.subscribe(data => {
      console.log('User joined:', data);
      this.webrtcService.createPeerConnection(data.connectionId, true, (signal) => {
        this.signalrService.sendSignal(data.connectionId, signal);
      });
      // Temporarily store name, stream will come later via ontrak
      this.remoteStreams.set(data.connectionId, { stream: new MediaStream(), userName: data.userName });
    });

    // Handle incoming signaling data
    this.signalrService.signalReceived$.subscribe(data => {
      this.webrtcService.handleSignal(data.senderConnectionId, data.signal, (signal) => {
        this.signalrService.sendSignal(data.senderConnectionId, signal);
      });
    });

    // When we join, we get the list of everyone else
    this.signalrService.joinedRoom$.subscribe(room => {
      room.users.forEach((user: any) => {
        if (user.connectionId !== this.signalrService.getConnectionId()) {
          this.remoteStreams.set(user.connectionId, { stream: new MediaStream(), userName: user.userName });
          // Note: The new user waits for offers from existing users in this Mesh setup
        }
      });
    });

    this.signalrService.userLeft$.subscribe(connectionId => {
      this.webrtcService.closeConnection(connectionId);
      this.remoteStreams.delete(connectionId);
    });

    this.signalrService.messageReceived$.subscribe(msg => {
      this.messages.push(msg);
      if (!this.isChatOpen) {
        this.unreadMessages++;
      }
      setTimeout(() => this.scrollToBottom(), 100);
    });
  }

  private setupWebRTCHandlers(): void {
    this.webrtcService.remoteStream$.subscribe(data => {
      const peer = this.remoteStreams.get(data.connectionId);
      if (peer) {
        peer.stream = data.stream;
      }
    });
  }

  toggleAudio(): void {
    if (this.localStream) {
      this.isAudioOn = !this.isAudioOn;
      this.localStream.getAudioTracks().forEach(track => track.enabled = this.isAudioOn);
    }
  }

  toggleVideo(): void {
    if (this.localStream) {
      this.isVideoOn = !this.isVideoOn;
      this.localStream.getVideoTracks().forEach(track => track.enabled = this.isVideoOn);
    }
  }

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.unreadMessages = 0;
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  sendMessage(): void {
    if (!this.newMessage.trim()) return;
    this.signalrService.sendMessage(this.roomCode, this.userName, this.newMessage);
    this.newMessage = '';
  }

  async loadDevices(): Promise<void> {
    const devices = await this.webrtcService.getDevices();
    this.cameras = devices.filter(d => d.kind === 'videoinput');
    this.microphones = devices.filter(d => d.kind === 'audioinput');
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  async onCameraChange(event: any): Promise<void> {
    this.selectedCamera = event.target.value;
    this.localStream = await this.webrtcService.getLocalStream(this.selectedCamera, this.selectedMic);
    this.applyCurrentMediaStates();
    this.showSettings = false;
  }

  async onMicChange(event: any): Promise<void> {
    this.selectedMic = event.target.value;
    this.localStream = await this.webrtcService.getLocalStream(this.selectedCamera, this.selectedMic);
    this.applyCurrentMediaStates();
    this.showSettings = false;
  }

  private applyCurrentMediaStates(): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => track.enabled = this.isAudioOn);
      this.localStream.getVideoTracks().forEach(track => track.enabled = this.isVideoOn);
    }
  }

  toggleMirror(): void {
    this.isMirrored = !this.isMirrored;
  }

  leaveRoom(): void {
    this.webrtcService.closeAllConnections();
    this.router.navigate(['/']);
  }

  private scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  ngOnDestroy(): void {
    this.webrtcService.closeAllConnections();
  }
}
