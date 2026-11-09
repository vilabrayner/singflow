import { Component } from '@angular/core';
import { ExperienceShell } from '../../shared/components/experience-shell';
@Component({
  imports: [ExperienceShell],
  template: `<app-experience-shell
    label="participante"
    heading="Sua próxima música começa aqui."
    description="Um espaço para escolher, participar e acompanhar seu momento no palco."
    icon="pi-microphone"
    emptyTitle="Vamos preparar sua entrada."
    emptyDescription="O check-in e as solicitações musicais estarão disponíveis em um próximo incremento."
  />`,
})
export class ParticipantLayout {}
