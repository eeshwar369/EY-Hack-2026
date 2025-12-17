import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Message {
  sender: 'customer' | 'aura';
  content: string;
  timestamp: string;
  suggestions?: string[];
}

export interface Session {
  sessionId: string;
  customerId: string;
  channel: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = environment.apiUrl;
  private socket: Socket | null = null;
  private messagesSubject = new Subject<Message>();
  private typingSubject = new Subject<boolean>();
  
  public messages$ = this.messagesSubject.asObservable();
  public typing$ = this.typingSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  initializeSession(channel: string = 'web'): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/chat/session`,
      { channel },
      { headers: this.getHeaders() }
    );
  }

  connectWebSocket(sessionId: string): void {
    this.socket = io(environment.wsUrl, {
      transports: ['websocket'],
      auth: {
        token: this.authService.getToken()
      }
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.socket?.emit('join-session', { sessionId });
    });

    this.socket.on('message', (message: Message) => {
      this.messagesSubject.next(message);
    });

    this.socket.on('typing', (data: { isTyping: boolean }) => {
      this.typingSubject.next(data.isTyping);
    });

    this.socket.on('error', (error: any) => {
      console.error('WebSocket error:', error);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });
  }

  sendMessage(sessionId: string, message: string): void {
    if (this.socket) {
      this.socket.emit('send-message', { sessionId, message });
      
      // Add customer message to UI immediately
      this.messagesSubject.next({
        sender: 'customer',
        content: message,
        timestamp: new Date().toISOString()
      });
    }
  }

  sendTypingIndicator(sessionId: string, isTyping: boolean): void {
    if (this.socket) {
      this.socket.emit('typing', { sessionId, isTyping });
    }
  }

  getHistory(sessionId: string, limit: number = 20): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/chat/history/${sessionId}?limit=${limit}`,
      { headers: this.getHeaders() }
    );
  }

  endSession(sessionId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/chat/session/end`,
      { sessionId },
      { headers: this.getHeaders() }
    );
  }

  disconnectWebSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
