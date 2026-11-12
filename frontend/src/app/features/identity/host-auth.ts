import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { AccountView, accountActive } from './account-view';
import { ApiClient } from '../../core/http/api-client';
@Injectable({ providedIn: 'root' })
export class HostAuth {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  async account() {
    const account = await this.api.get<AccountView>('/auth/me');
    if (!accountActive(account)) {
      await this.router.navigateByUrl('/conta');
      throw new HttpErrorResponse({ status: 401 });
    }
    return account;
  }
  async me() {
    const account = await this.account();
    if (account.role && account.role !== 'HOST' && !account.administrator)
      throw new HttpErrorResponse({ status: 401 });
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
