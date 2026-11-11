import { Routes } from '@angular/router';
import { resumeParticipation } from './features/participation/participation-memory';

export const routes: Routes = [
  {
    path: 'cadastro/anfitriao',
    title: 'Cadastro de anfitrião · SingFlow',
    data: { role: 'HOST' },
    loadComponent: () =>
      import('./features/identity/registration.page').then((m) => m.RegistrationPage),
  },
  {
    path: 'cadastro/musico',
    title: 'Cadastro de músico · SingFlow',
    data: { role: 'MUSICIAN' },
    loadComponent: () =>
      import('./features/identity/registration.page').then((m) => m.RegistrationPage),
  },
  {
    path: 'confirmar-email',
    title: 'Confirmar e-mail · SingFlow',
    loadComponent: () =>
      import('./features/identity/email-confirmation.page').then((m) => m.EmailConfirmationPage),
  },
  {
    path: 'conta',
    title: 'Situação da conta · SingFlow',
    loadComponent: () =>
      import('./features/identity/account-status.page').then((m) => m.AccountStatusPage),
  },
  {
    path: 'admin',
    title: 'Administração · SingFlow',
    loadComponent: () => import('./features/administration/admin.page').then((m) => m.AdminPage),
  },
  {
    path: '',
    canActivate: [resumeParticipation],
    title: 'SingFlow — Sua voz no palco',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'participante/:session/vincular',
    title: 'Vincular participação · SingFlow',
    loadComponent: () =>
      import('./features/participation/claim-access.page').then((m) => m.ClaimAccessPage),
  },
  {
    path: 'participante/:session/:code',
    title: 'Minha participação · SingFlow',
    loadComponent: () =>
      import('./features/participation/participant.page').then((m) => m.ParticipantPage),
  },
  {
    path: 'participante/:session',
    pathMatch: 'full',
    redirectTo: 'participante/:session/vinculado',
  },
  {
    path: 'participante',
    canActivate: [resumeParticipation],
    title: 'Participante · SingFlow',
    loadComponent: () =>
      import('./layouts/participant/participant.layout').then((m) => m.ParticipantLayout),
  },
  {
    path: 'anfitriao',
    title: 'Anfitrião · SingFlow',
    loadComponent: () => import('./layouts/host/host.layout').then((m) => m.HostLayout),
  },
  {
    path: 'musico',
    title: 'Músico · SingFlow',
    loadComponent: () => import('./layouts/musician/musician.layout').then((m) => m.MusicianLayout),
  },
  {
    path: '**',
    title: 'Página não encontrada · SingFlow',
    loadComponent: () => import('./shared/components/not-found.page').then((m) => m.NotFoundPage),
  },
];
