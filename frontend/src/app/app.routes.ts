import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'SingFlow — Sua voz no palco',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'participante',
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
