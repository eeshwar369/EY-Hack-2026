import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent {
  @Output() authenticated = new EventEmitter<void>();
  
  isLoading = false;
  error = '';

  constructor(private authService: AuthService) {}

  guestLogin(): void {
    this.isLoading = true;
    this.error = '';
    
    this.authService.guestLogin().subscribe({
      next: () => {
        this.isLoading = false;
        this.authenticated.emit();
      },
      error: (err) => {
        this.isLoading = false;
        this.error = 'Failed to start guest session. Please try again.';
        console.error('Guest login error:', err);
      }
    });
  }
}
