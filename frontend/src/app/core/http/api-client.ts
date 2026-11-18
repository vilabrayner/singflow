import { ApplicationLoading } from '../../shared/application-loading';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout, takeUntil, fromEvent, NEVER } from 'rxjs';
import { RUNTIME_CONFIG } from '../config/runtime-config.token';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly loading = inject(ApplicationLoading);
  private readonly config = inject(RUNTIME_CONFIG);
  private url(path: string): string {
    return `${this.config.apiBaseUrl === '/' ? '' : this.config.apiBaseUrl}${path}`;
  }
  get<T>(
    path: string,
    options: { background?: boolean; blocking?: boolean; signal?: AbortSignal } = {},
  ): Promise<T> {
    return this.loading.track(
      () => {
        if (options.signal?.aborted)
          return Promise.reject(new DOMException('Aborted', 'AbortError'));
        return firstValueFrom(
          this.http
            .get<T>(this.url(path))
            .pipe(
              timeout(15000),
              takeUntil(options.signal ? fromEvent(options.signal, 'abort') : NEVER),
            ),
        );
      },
      options.background || options.blocking === false,
    );
  }
  async post<T>(
    path: string,
    body: unknown = {},
    headers: Record<string, string> = {},
    options: { background?: boolean } = {},
  ): Promise<T> {
    return this.loading.track(async () => {
      // One foreground operation includes CSRF and the mutation, without a gap between masks.
      const csrf = await this.get<{ token: string; headerName: string }>('/auth/csrf', {
        background: true,
      });
      return firstValueFrom(
        this.http
          .post<T>(this.url(path), body, { headers: { ...headers, [csrf.headerName]: csrf.token } })
          .pipe(timeout(15000)),
      );
    }, options.background);
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
