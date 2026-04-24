import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SignalrService } from '../../services/signalr.service';
import { WebrtcService } from '../../services/webrtc.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface RemotePeer {
  stream: MediaStream;
  userName: string;
  status: 'online' | 'away' | 'offline';
  isAudioOn: boolean;
  isVideoOn: boolean;
  hasStream: boolean;
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
  
  isAudioOn: boolean = false;
  isVideoOn: boolean = true;
  isMirrored: boolean = true;
  showSettings: boolean = false;
  
  cameras: MediaDeviceInfo[] = [];
  microphones: MediaDeviceInfo[] = [];
  selectedCamera: string = '';
  selectedMic: string = '';
  speakers: MediaDeviceInfo[] = [];
  selectedSpeaker: string = '';

  callDuration: number = 0;
  callTimer: string = '00:00:00';
  private timerInterval: any;

  showUserList: boolean = false;
  copyAlert: string = '';
  remoteNotification: string = '';

  private streamCache: Map<string, MediaStream> = new Map();

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
      this.applyCurrentMediaStates();
    } catch (err) {
      console.error('Could not get local stream', err);
      alert('Camera and Microphone access are required.');
    }

    this.setupSignalRHandlers();
    this.setupWebRTCHandlers();
    this.startTimer();

    // After everything is setup, notify others that we are ready
    if (this.localStream) {
      this.signalrService.notifyReady(this.roomCode);
    }
  }

  private setupSignalRHandlers(): void {
    // When a new user joins, we (the existing users) initiate a connection to them
    this.signalrService.userJoined$.subscribe(data => {
      if (this.remoteStreams.has(data.connectionId)) return;
      
      console.log('User joined:', data);
      // We don't initiate yet, we wait for PeerReady from the new user
      this.remoteStreams.set(data.connectionId, { 
        stream: new MediaStream(), 
        userName: data.userName,
        status: 'online',
        isAudioOn: true,
        isVideoOn: true,
        hasStream: false
      });
      this.remoteStreams = new Map(this.remoteStreams);
    });

    this.signalrService.peerReady$.subscribe(connectionId => {
      console.log('Peer ready:', connectionId);
      const peer = this.remoteStreams.get(connectionId);
      if (peer) {
        this.webrtcService.createPeerConnection(connectionId, true, (signal) => {
          this.signalrService.sendSignal(connectionId, signal);
        });
      }
    });

    // Handle incoming signaling data
    this.signalrService.signalReceived$.subscribe(data => {
      this.webrtcService.handleSignal(data.senderConnectionId, data.signal, (signal) => {
        this.signalrService.sendSignal(data.senderConnectionId, signal);
      });
    });

    // When we join, we get the list of everyone else
    this.signalrService.joinedRoom$.subscribe(room => {
      if (!room) return;
      room.users.forEach((user: any) => {
        if (user.connectionId !== this.signalrService.getConnectionId()) {
          const cachedStream = this.streamCache.get(user.connectionId);
          this.remoteStreams.set(user.connectionId, { 
            stream: cachedStream || new MediaStream(), 
            userName: user.userName,
            status: 'online',
            isAudioOn: true,
            isVideoOn: true,
            hasStream: !!cachedStream
          });
        }
      });
      this.remoteStreams = new Map(this.remoteStreams);
    });

    this.signalrService.userLeft$.subscribe(connectionId => {
      console.log('User left, cleaning up:', connectionId);
      this.webrtcService.closeConnection(connectionId);
      this.remoteStreams.delete(connectionId);
      this.remoteStreams = new Map(this.remoteStreams);
    });

    this.signalrService.userStatusUpdate$.subscribe(data => {
      const peer = this.remoteStreams.get(data.connectionId);
      if (peer) {
        try {
          const state = JSON.parse(data.status);
          peer.status = state.status || peer.status;
          peer.isAudioOn = state.isAudioOn ?? peer.isAudioOn;
          peer.isVideoOn = state.isVideoOn ?? peer.isVideoOn;
        } catch {
          peer.status = data.status as any;
        }
        this.remoteStreams = new Map(this.remoteStreams);
      }
    });

    this.signalrService.messageReceived$.subscribe(msg => {
      this.messages.push(msg);
      // Auto-popup chat for other users
      this.isChatOpen = true;
      this.unreadMessages = 0;
      setTimeout(() => this.scrollToBottom());
    });

    this.signalrService.actionNotification$.subscribe(data => {
      const user = this.remoteStreams.get(data.connectionId);
      if (user && data.action === 'copied_room_code') {
        this.showRemoteNotification(`${user.userName} copied the room code`);
      }
    });
  }

  private setupWebRTCHandlers(): void {
    this.webrtcService.remoteStream$.subscribe(data => {
      const peer = this.remoteStreams.get(data.connectionId);
      if (peer) {
        // Trigger change detection by creating a new Map reference
        this.remoteStreams.set(data.connectionId, { ...peer, stream: data.stream, hasStream: true });
        this.remoteStreams = new Map(this.remoteStreams);
      } else {
        // Cache the stream if the user isn't in the map yet
        this.streamCache.set(data.connectionId, data.stream);
      }
    });
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    const status = document.visibilityState === 'visible' ? 'online' : 'away';
    this.signalrService.updateStatus(this.roomCode, status);
  }

  @HostListener('window:blur')
  onBlur(): void {
    this.signalrService.updateStatus(this.roomCode, 'away');
  }

  @HostListener('window:focus')
  onFocus(): void {
    this.signalrService.updateStatus(this.roomCode, 'online');
  }

  toggleAudio(): void {
    if (this.localStream) {
      this.isAudioOn = !this.isAudioOn;
      this.localStream.getAudioTracks().forEach(track => track.enabled = this.isAudioOn);
      this.broadcastMediaState();
    }
  }

  toggleVideo(): void {
    if (this.localStream) {
      this.isVideoOn = !this.isVideoOn;
      this.localStream.getVideoTracks().forEach(track => track.enabled = this.isVideoOn);
      this.broadcastMediaState();
    }
  }

  private broadcastMediaState(): void {
    const state = JSON.stringify({
      status: document.visibilityState === 'visible' ? 'online' : 'away',
      isAudioOn: this.isAudioOn,
      isVideoOn: this.isVideoOn
    });
    this.signalrService.updateStatus(this.roomCode, state);
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
    this.speakers = devices.filter(d => d.kind === 'audiooutput');
    
    // Set initial selected values based on the current local stream tracks
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (videoTrack) this.selectedCamera = videoTrack.getSettings().deviceId || '';
      if (audioTrack) this.selectedMic = audioTrack.getSettings().deviceId || '';
    }

    // Try to find default speaker
    const defaultSpeaker = this.speakers.find(s => s.deviceId === 'default') || this.speakers[0];
    if (defaultSpeaker) {
      this.selectedSpeaker = defaultSpeaker.deviceId;
    }
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

  async onSpeakerChange(event: any): Promise<void> {
    this.selectedSpeaker = event.target.value;
    await this.webrtcService.setAudioOutput(this.selectedSpeaker);
    this.showSettings = false;
  }

  private applyCurrentMediaStates(): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => track.enabled = this.isAudioOn);
      this.localStream.getVideoTracks().forEach(track => track.enabled = this.isVideoOn);
    }
  }

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.callDuration++;
      const hours = Math.floor(this.callDuration / 3600);
      const minutes = Math.floor((this.callDuration % 3600) / 60);
      const seconds = this.callDuration % 60;
      this.callTimer = [hours, minutes, seconds]
        .map(v => v < 10 ? '0' + v : v)
        .join(':');
    }, 1000);
  }

  copyRoomCode(): void {
    navigator.clipboard.writeText(this.roomCode);
    this.showRemoteNotification('Room code copied!');
    this.signalrService.notifyAction(this.roomCode, 'copied_room_code');
  }

  toggleUserList(event: Event): void {
    event.stopPropagation();
    this.showUserList = !this.showUserList;
  }

  private showRemoteNotification(message: string): void {
    this.remoteNotification = message;
    setTimeout(() => this.remoteNotification = '', 5000);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showUserList = false;
  }

  toggleMirror(): void {
    this.isMirrored = !this.isMirrored;
  }

  leaveRoom(): void {
    this.webrtcService.stopLocalStream();
    this.webrtcService.closeAllConnections();
    this.signalrService.leaveRoom(this.roomCode);
    this.router.navigate(['/'], { replaceUrl: true });
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.leaveRoom();
  }

  private scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.webrtcService.stopLocalStream();
    this.webrtcService.closeAllConnections();
    this.signalrService.leaveRoom(this.roomCode);
  }
}
