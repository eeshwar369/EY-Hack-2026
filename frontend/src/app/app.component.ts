import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent } from './components/chat/chat.component';
import { AuthComponent } from './components/auth/auth.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ChatComponent, AuthComponent],
  template: `
    <div class="min-h-screen">
      <app-auth *ngIf="!isAuthenticated" (authenticated)="onAuthenticated()"></app-auth>
      <app-chat *ngIf="isAuthenticated"></app-chat>
    </div>
  `
})
export class AppComponent implements OnInit {
  isAuthenticated = false;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.isAuthenticated = this.authService.isAuthenticated();
    this.authService.currentCustomer$.subscribe(customer => {
      this.isAuthenticated = !!customer;
    });
  }

  onAuthenticated(): void {
    this.isAuthenticated = true;
  }
}
