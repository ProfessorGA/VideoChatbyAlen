import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebrtcService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private iceCandidateQueues: Map<string, RTCIceCandidateInit[]> = new Map();
  private remoteVideos: Map<string, HTMLVideoElement[]> = new Map();
  private currentSpeakerId: string = '';
  
  public remoteStream$ = new Subject<{ connectionId: string, stream: MediaStream }>();

  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10
  };

  private localStream: MediaStream | null = null;

  constructor() { }

  public stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  public async getLocalStream(cameraId?: string, micId?: string): Promise<MediaStream> {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
      video: cameraId ? { deviceId: { exact: cameraId } } : true,
      audio: micId ? { deviceId: { exact: micId } } : true
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      this.peerConnections.forEach(pc => {
        const senders = pc.getSenders();
        this.localStream!.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          } else {
            pc.addTrack(track, this.localStream!);
          }
        });
      });

      return this.localStream;
    } catch (err) {
      console.error('Error getting user media:', err);
      throw err;
    }
  }

  public async getDevices(): Promise<MediaDeviceInfo[]> {
    return await navigator.mediaDevices.enumerateDevices();
  }

  public async setAudioOutput(deviceId: string): Promise<void> {
    this.currentSpeakerId = deviceId;
    const videos = document.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i] as any;
      if (video.setSinkId && !video.muted) {
        try {
          await video.setSinkId(deviceId);
        } catch (err) {
          console.error('Error setting speaker:', err);
        }
      }
    }
  }

  public createPeerConnection(connectionId: string, isInitiator: boolean, onSignal: (signal: any) => void): RTCPeerConnection {
    // If old connection exists, close it
    this.closeConnection(connectionId);

    const pc = new RTCPeerConnection(this.iceServers);
    this.peerConnections.set(connectionId, pc);
    this.iceCandidateQueues.set(connectionId, []);

    const remoteStream = new MediaStream();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onSignal({ candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received track from:', connectionId, event.track.kind);
      remoteStream.addTrack(event.track);
      this.remoteStream$.next({ connectionId, stream: new MediaStream(remoteStream.getTracks()) });
      
      // Auto-apply speaker to new remote audio
      if (this.currentSpeakerId) {
        setTimeout(() => this.setAudioOutput(this.currentSpeakerId), 500);
      }
    };

    this.attachLocalTracks(pc);

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then(async offer => {
        await pc.setLocalDescription(offer);
        onSignal({ offer });
      });
    }

    return pc;
  }

  private attachLocalTracks(pc: RTCPeerConnection): void {
    if (this.localStream) {
      const currentSenders = pc.getSenders();
      this.localStream.getTracks().forEach(track => {
        if (!currentSenders.find(s => s.track?.kind === track.kind)) {
          pc.addTrack(track, this.localStream!);
        }
      });
    }
  }

  public async handleSignal(connectionId: string, signalData: any, onSignal: (signal: any) => void): Promise<void> {
    const signal = typeof signalData === 'string' ? JSON.parse(signalData) : signalData;
    let pc = this.peerConnections.get(connectionId);

    if (signal.offer) {
      if (pc && pc.signalingState !== 'stable') {
        this.closeConnection(connectionId);
        pc = null as any;
      }
      
      if (!pc) {
        pc = this.createPeerConnection(connectionId, false, onSignal);
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
      
      const queue = this.iceCandidateQueues.get(connectionId) || [];
      for (const candidate of queue) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.iceCandidateQueues.set(connectionId, []);

      this.attachLocalTracks(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onSignal({ answer });
      
    } else if (signal.answer) {
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        
        const queue = this.iceCandidateQueues.get(connectionId) || [];
        for (const candidate of queue) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.iceCandidateQueues.set(connectionId, []);
      }
    } else if (signal.candidate) {
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        const queue = this.iceCandidateQueues.get(connectionId) || [];
        queue.push(signal.candidate);
        this.iceCandidateQueues.set(connectionId, queue);
      }
    }
  }

  public closeConnection(connectionId: string): void {
    const pc = this.peerConnections.get(connectionId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(connectionId);
      this.iceCandidateQueues.delete(connectionId);
    }
  }

  public closeAllConnections(): void {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.iceCandidateQueues.clear();
  }
}
