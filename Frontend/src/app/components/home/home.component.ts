import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SignalrService } from '../../services/signalr.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  roomCode: string = '';
  userName: string = '';
  error: string = '';

  constructor(private signalrService: SignalrService, private router: Router) { }

  ngOnInit(): void {
    this.signalrService.startConnection();

    this.signalrService.roomCreated$.subscribe(code => {
      // After room is created, we still need the user to provide a name
      this.roomCode = code;
    });

    this.signalrService.error$.subscribe(err => {
      this.error = err;
    });

    this.signalrService.joinedRoom$.subscribe(room => {
      this.router.navigate(['/room', room.roomCode], { state: { userName: this.userName } });
    });
  }

  createRoom(): void {
    this.signalrService.createRoom();
  }

  joinRoom(): void {
    if (!this.roomCode || !this.userName) return;
    this.signalrService.joinRoom(this.roomCode.toUpperCase(), this.userName);
  }
}
