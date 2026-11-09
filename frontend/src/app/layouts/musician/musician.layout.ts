import { Component } from '@angular/core';
import { ExperienceShell } from '../../shared/components/experience-shell';
@Component({
  imports: [ExperienceShell],
  template: `<app-experience-shell
    label="do músico"
    heading="Em sintonia com cada voz."
    description="O que você precisa para acompanhar o palco e fazer a música acontecer."
    icon="pi-headphones"
    emptyTitle="Estamos afinando os detalhes."
    emptyDescription="O repertório e as convocações confirmadas aparecerão aqui quando os fluxos estiverem disponíveis."
  />`,
})
export class MusicianLayout {}
