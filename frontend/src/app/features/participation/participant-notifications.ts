import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/http/api-client';

@Injectable({ providedIn: 'root' })
export class ParticipantNotifications {
  private readonly api = inject(ApiClient);
  private assertSupported() {
    if (
      !isSecureContext ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    )
      throw new Error('Este navegador precisa de HTTPS e suporte a notificações.');
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (
      ios &&
      !matchMedia('(display-mode: standalone)').matches &&
      !(navigator as Navigator & { standalone?: boolean }).standalone
    )
      throw new Error(
        'No iPhone/iPad, adicione o SingFlow à Tela de Início e abra por lá para ativar os avisos.',
      );
  }
  private async registration() {
    this.assertSupported();
    const previous = await navigator.serviceWorker.getRegistration('/');
    if (previous?.active && new URL(previous.active.scriptURL).pathname !== '/notifications-sw.js')
      throw new Error(
        'Este aparelho usa outro serviço do aplicativo. Atualize antes de ativar os avisos.',
      );
    await navigator.serviceWorker.register('/notifications-sw.js', { scope: '/' });
    return navigator.serviceWorker.ready;
  }
  async enable(publicKey: string) {
    // Called only from an explicit tap. Permission is never requested on page load.
    this.assertSupported();
    const permission = await Notification.requestPermission();
    if (permission !== 'granted')
      throw new Error(
        'As notificações não foram autorizadas. Você pode liberar o acesso nas configurações do navegador.',
      );
    const registration = await this.registration();
    const value = publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const key = Uint8Array.from(atob(value + '='.repeat((4 - (value.length % 4)) % 4)), (c) =>
      c.charCodeAt(0),
    );
    let previous = await registration.pushManager.getSubscription();
    const oldKey = previous?.options.applicationServerKey;
    if (
      previous &&
      oldKey &&
      (new Uint8Array(oldKey).length !== key.length ||
        new Uint8Array(oldKey).some((value, index) => value !== key[index]))
    ) {
      await this.api.post('/participant-account/notifications/push/remove', {
        endpoint: previous.endpoint,
      });
      await previous.unsubscribe();
      previous = null;
    }
    const subscription =
      previous ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer as ArrayBuffer,
      }));
    await this.api.post('/participant-account/notifications/push', {
      ...subscription.toJSON(),
      accepted: true,
    });
  }
  async disable() {
    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await this.api.post('/participant-account/notifications/push/remove', {
      endpoint: subscription.endpoint,
    });
    await subscription.unsubscribe();
  }
}
