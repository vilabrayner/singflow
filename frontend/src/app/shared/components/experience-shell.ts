import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-experience-shell',
  imports: [RouterLink, ButtonModule, TagModule],
  template: `
    <section class="role-page page-width">
      <a routerLink="/" class="back-link"
        ><i class="pi pi-arrow-left" aria-hidden="true"></i> Todas as experiências</a
      >
      <div class="role-intro">
        <p class="eyebrow">Experiência {{ label() }}</p>
        <h1>{{ heading() }}</h1>
        <p class="hero-description">{{ description() }}</p>
      </div>
      <div class="empty-panel">
        <span class="role-icon purple"><i [class]="'pi ' + icon()" aria-hidden="true"></i></span
        ><p-tag severity="secondary" value="Em desenvolvimento" />
        <h2>{{ emptyTitle() }}</h2>
        <p>{{ emptyDescription() }}</p>
        <p-button
          label="Voltar ao início"
          routerLink="/"
          icon="pi pi-arrow-left"
          [outlined]="true"
        />
      </div>
      <p class="role-footnote">
        Esta página apresenta a estrutura inicial. Nenhuma sessão está ativa e nenhuma ação de
        negócio é executada aqui.
      </p>
    </section>
  `,
})
export class ExperienceShell {
  readonly label = input.required<string>();
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input.required<string>();
  readonly emptyTitle = input.required<string>();
  readonly emptyDescription = input.required<string>();
}
