import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SignalrService {
  private hubConnection: signalR.HubConnection | null = null;
  
  public roomCreated$ = new Subject<string>();
  public userJoined$ = new Subject<{ connectionId: string, userName: string }>();
  public userLeft$ = new Subject<string>();
  public joinedRoom$ = new Subject<any>();
  public signalReceived$ = new Subject<{ senderConnectionId: string, signal: any }>();
  public messageReceived$ = new Subject<{ userName: string, content: string }>();
  public error$ = new Subject<string>();
  
  private connectionEstablished = new BehaviorSubject<boolean>(false);
  public connectionEstablished$ = this.connectionEstablished.asObservable();

  constructor() { }

  public startConnection(): void {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl)
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => {
        console.log('SignalR Connection Started');
        this.connectionEstablished.next(true);
        this.registerHandlers();
      })
      .catch(err => console.log('Error while starting connection: ' + err));
  }

  private registerHandlers(): void {
    if (!this.hubConnection) return;

    this.hubConnection.on('RoomCreated', (roomCode: string) => {
      this.roomCreated$.next(roomCode);
    });

    this.hubConnection.on('UserJoined', (data: { connectionId: string, userName: string }) => {
      this.userJoined$.next(data);
    });

    this.hubConnection.on('UserLeft', (connectionId: string) => {
      this.userLeft$.next(connectionId);
    });

    this.hubConnection.on('JoinedRoom', (room: any) => {
      this.joinedRoom$.next(room);
    });

    this.hubConnection.on('SignalReceived', (data: { senderConnectionId: string, signal: any }) => {
      this.signalReceived$.next(data);
    });

    this.hubConnection.on('MessageReceived', (data: { userName: string, content: string }) => {
      this.messageReceived$.next(data);
    });

    this.hubConnection.on('Error', (error: string) => {
      this.error$.next(error);
    });
  }

  public createRoom(): void {
    this.hubConnection?.invoke('CreateRoom');
  }

  public joinRoom(roomCode: string, userName: string): void {
    this.hubConnection?.invoke('JoinRoom', roomCode, userName);
  }

  public sendSignal(targetConnectionId: string, signal: any): void {
    this.hubConnection?.invoke('SendSignal', targetConnectionId, signal);
  }

  public sendMessage(roomCode: string, userName: string, content: string): void {
    this.hubConnection?.invoke('SendMessage', roomCode, userName, content);
  }

  public getConnectionId(): string | null {
    return this.hubConnection?.connectionId || null;
  }
}
