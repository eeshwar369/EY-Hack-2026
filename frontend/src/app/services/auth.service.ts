import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Customer {
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  isGuest?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentCustomerSubject = new BehaviorSubject<Customer | null>(null);
  public currentCustomer$ = this.currentCustomerSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadCustomerFromStorage();
  }

  private loadCustomerFromStorage(): void {
    const token = localStorage.getItem('token');
    const customer = localStorage.getItem('customer');
    if (token && customer) {
      this.currentCustomerSubject.next(JSON.parse(customer));
    }
  }

  guestLogin(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/guest`, {}).pipe(
      tap((response: any) => {
        localStorage.setItem('token', response.token);
        localStorage.setItem('customer', JSON.stringify(response.customer));
        this.currentCustomerSubject.next(response.customer);
      })
    );
  }

  register(email: string, password: string, firstName: string, lastName: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, {
      email,
      password,
      firstName,
      lastName
    }).pipe(
      tap((response: any) => {
        localStorage.setItem('token', response.token);
        localStorage.setItem('customer', JSON.stringify(response.customer));
        this.currentCustomerSubject.next(response.customer);
      })
    );
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, {
      email,
      password
    }).pipe(
      tap((response: any) => {
        localStorage.setItem('token', response.token);
        localStorage.setItem('customer', JSON.stringify(response.customer));
        this.currentCustomerSubject.next(response.customer);
      })
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('customer');
    this.currentCustomerSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getCurrentCustomer(): Customer | null {
    return this.currentCustomerSubject.value;
  }
}
