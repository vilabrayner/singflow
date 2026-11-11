import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { RUNTIME_CONFIG } from '../config/runtime-config.token';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);
  private url(path: string): string {
    return `${this.config.apiBaseUrl === '/' ? '' : this.config.apiBaseUrl}${path}`;
  }
  get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path)).pipe(timeout(15000)));
  }
  async post<T>(
    path: string,
    body: unknown = {},
    headers: Record<string, string> = {},
  ): Promise<T> {
    // Fetch the current token for every mutation, including after login/logout rotation.
    const csrf = await this.get<{ token: string; headerName: string }>('/auth/csrf');
    return firstValueFrom(
      this.http
        .post<T>(this.url(path), body, {
          headers: { ...headers, [csrf.headerName]: csrf.token },
        })
        .pipe(timeout(15000)),
    );
  }
}

export function apiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'Entre novamente para continuar.';
    if (error.status === 403 && error.error?.code === 'ACCOUNT_NOT_ACTIVE')
      return 'Seu acesso está pendente ou suspenso. Consulte a situação em /conta.';
    if (error.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente novamente.';
    if (error.status === 403)
      return 'Acesso não autorizado. Recarregue a página e tente novamente.';
    if (error.status === 404) return 'Registro não encontrado ou indisponível para este anfitrião.';
    if (error.status === 409)
      return error.error?.detail ?? 'A operação conflita com o estado atual. Atualize a lista.';
    if (error.status === 400) return 'Confira os campos e os limites indicados.';
  }
  return 'Não foi possível confirmar a operação. Confira a conexão e atualize a lista antes de tentar novamente.';
}
