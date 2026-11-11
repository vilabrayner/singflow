import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client';
@Injectable({ providedIn: 'root' })
export class HostAuth {
  private readonly api = inject(ApiClient);
  async me() {
    const account = await this.api.get<{ email: string; role?: string }>('/auth/me');
    if (account.role && account.role !== 'HOST') throw new HttpErrorResponse({ status: 401 });
    return account;
  }
  login(email: string, password: string) {
    const body = new HttpParams({ fromObject: { email: email.trim().toLowerCase(), password } });
    return this.api.post<void>('/auth/login', body);
  }
  logout() {
    return this.api.post<void>('/auth/logout');
  }
}
