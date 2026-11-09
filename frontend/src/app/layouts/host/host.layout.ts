import { Component } from '@angular/core';
import { ExperienceShell } from '../../shared/components/experience-shell';
@Component({
  imports: [ExperienceShell],
  template: `<app-experience-shell
    label="do anfitrião"
    heading="Uma noite boa tem um bom ritmo."
    description="Conduza a experiência e dê a cada voz seu lugar no show."
    icon="pi-users"
    emptyTitle="Seu painel está ganhando forma."
    emptyDescription="A criação de sessões, a fila sugerida e as convocações serão implementadas nos próximos incrementos."
  />`,
})
export class HostLayout {}
