import { Component } from '@angular/core';
import { ExperienceShell } from '../../shared/components/experience-shell';
@Component({
  imports: [ExperienceShell],
  template: `<app-experience-shell
    label="participante"
    heading="Sua próxima música começa aqui."
    description="Um espaço para escolher, participar e acompanhar seu momento no palco."
    icon="fa-solid fa-bullhorn"
    emptyTitle="Peça o QR Code ao anfitrião."
    emptyDescription="Abra o link da sessão para entrar com sua primeira música. Se precisar de ajuda, o anfitrião também pode fazer sua inscrição."
  />`,
})
export class ParticipantLayout {}
