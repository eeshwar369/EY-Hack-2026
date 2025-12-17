import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, Message } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  
  messages: Message[] = [];
  currentMessage = '';
  sessionId = '';
  isTyping = false;
  isLoading = true;
  suggestions: string[] = [];
  customer: any;

  private shouldScrollToBottom = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.customer = this.authService.getCurrentCustomer();
    this.initializeChat();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.chatService.disconnectWebSocket();
  }

  private initializeChat(): void {
    this.chatService.initializeSession('web').subscribe({
      next: (response) => {
        this.sessionId = response.session.sessionId;
        this.chatService.connectWebSocket(this.sessionId);
        
        // Subscribe to messages
        this.chatService.messages$.subscribe(message => {
          this.messages.push(message);
          if (message.suggestions) {
            this.suggestions = message.suggestions;
          }
          this.shouldScrollToBottom = true;
        });

        // Subscribe to typing indicator
        this.chatService.typing$.subscribe(isTyping => {
          this.isTyping = isTyping;
          this.shouldScrollToBottom = true;
        });

        this.isLoading = false;
        
        // Add welcome message
        this.messages.push({
          sender: 'aura',
          content: `Hi ${this.customer?.firstName || 'there'}! 👋 I'm AURA, your personal shopping assistant. How can I help you today?`,
          timestamp: new Date().toISOString(),
          suggestions: [
            'Show me trending items',
            'I need help finding a dress',
            'What\'s on sale?'
          ]
        });
        this.suggestions = this.messages[0].suggestions || [];
        this.shouldScrollToBottom = true;
      },
      error: (err) => {
        console.error('Failed to initialize session:', err);
        this.isLoading = false;
      }
    });
  }

  sendMessage(): void {
    if (!this.currentMessage.trim() || !this.sessionId) return;

    const message = this.currentMessage.trim();
    this.currentMessage = '';
    
    this.chatService.sendMessage(this.sessionId, message);
    this.suggestions = [];
  }

  useSuggestion(suggestion: string): void {
    this.currentMessage = suggestion;
    this.sendMessage();
  }

  onInputChange(): void {
    if (this.currentMessage.trim()) {
      this.chatService.sendTypingIndicator(this.sessionId, true);
    } else {
      this.chatService.sendTypingIndicator(this.sessionId, false);
    }
  }

  logout(): void {
    if (this.sessionId) {
      this.chatService.endSession(this.sessionId).subscribe();
    }
    this.authService.logout();
  }

  private scrollToBottom(): void {
    try {
      this.messagesContainer.nativeElement.scrollTop = 
        this.messagesContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Scroll error:', err);
    }
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
}
