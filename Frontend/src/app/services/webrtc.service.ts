import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebrtcService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  
  public remoteStream$ = new Subject<{ connectionId: string, stream: MediaStream }>();
  public onConnectionClosed$ = new Subject<string>();

  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  constructor() { }

  public async getLocalStream(videoSource?: string, audioSource?: string): Promise<MediaStream> {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    const constraints = {
      video: videoSource ? { deviceId: { exact: videoSource } } : true,
      audio: audioSource ? { deviceId: { exact: audioSource } } : true
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Update existing peer connections with new tracks
    this.peerConnections.forEach(pc => {
      const senders = pc.getSenders();
      this.localStream?.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track);
        } else {
          pc.addTrack(track, this.localStream!);
        }
      });
    });

    return this.localStream;
  }

  public async getDevices(): Promise<MediaDeviceInfo[]> {
    return await navigator.mediaDevices.enumerateDevices();
  }

  public createPeerConnection(connectionId: string, isInitiator: boolean, onSignal: (signal: any) => void): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.iceServers);
    
    this.peerConnections.set(connectionId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onSignal({ candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream$.next({ connectionId, stream: event.streams[0] });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed' || pc.iceConnectionState === 'failed') {
        this.closeConnection(connectionId);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        onSignal({ offer });
      });
    }

    return pc;
  }

  public async handleSignal(connectionId: string, signal: any, onSignal: (signal: any) => void): Promise<void> {
    let pc = this.peerConnections.get(connectionId);

    if (signal.offer) {
      if (!pc) {
        pc = this.createPeerConnection(connectionId, false, onSignal);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onSignal({ answer });
    } else if (signal.answer) {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
      }
    } else if (signal.candidate) {
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    }
  }

  public closeConnection(connectionId: string): void {
    const pc = this.peerConnections.get(connectionId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(connectionId);
      this.onConnectionClosed$.next(connectionId);
    }
  }

  public closeAllConnections(): void {
    this.peerConnections.forEach((pc, id) => {
      pc.close();
    });
    this.peerConnections.clear();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
}
