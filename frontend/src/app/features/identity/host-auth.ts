import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client';
@Injectable({ providedIn: 'root' })
export class HostAuth {
  private readonly api = inject(ApiClient);
  me() {
    return this.api.get<{ email: string }>('/auth/me');
  }
  login(email: string, password: string) {
    const body = new HttpParams({ fromObject: { email: email.trim().toLowerCase(), password } });
    return this.api.post<void>('/auth/login', body);
  }
  logout() {
    return this.api.post<void>('/auth/logout');
  }
}
