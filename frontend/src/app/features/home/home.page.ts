import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { BackendStatus } from '../../shared/components/backend-status';

@Component({
  standalone: true,
  imports: [RouterLink, TagModule, BackendStatus],
  template: `
    <section class="hero page-width">
      <div class="hero-copy">
        <p class="eyebrow">
          <span class="tiny-line"></span> A música conecta. O SingFlow organiza.
        </p>
        <h1>Sua voz no palco,<br /><span>na ordem certa.</span></h1>
        <p class="hero-description">
          Mais música, mais encontros. Uma experiência de karaokê pensada para quem canta, quem
          organiza e quem faz o som acontecer.
        </p>
        <div class="hero-note">
          <i class="pi pi-sparkles" aria-hidden="true"></i
          ><span
            >Estamos preparando o próximo show.<br /><strong
              >Conheça as três experiências.</strong
            ></span
          >
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✦</span>
        <div class="mic-circle"><i class="pi pi-microphone"></i></div>
        <div class="sound-bars">
          @for (bar of bars; track $index) {
            <span [style.height.px]="bar"></span>
          }
        </div>
        <div class="art-caption">CADA VOZ TEM SEU MOMENTO</div>
      </div>
    </section>
    <section class="experiences page-width" aria-labelledby="experiences-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Três jeitos de fazer parte</p>
          <h2 id="experiences-title">Qual é o seu lugar no show?</h2>
        </div>
        <p-tag value="Primeira versão em desenvolvimento" severity="secondary" />
      </div>
      <div class="experience-grid">
        @for (role of roles; track role.path) {
          <a class="experience-card" [routerLink]="role.path">
            <span class="role-icon" [class]="'role-icon ' + role.color"
              ><i [class]="'pi ' + role.icon" aria-hidden="true"></i
            ></span>
            <h3>{{ role.title }}</h3>
            <p>{{ role.description }}</p>
            <span class="card-link"
              >Conhecer experiência <i class="pi pi-arrow-up-right" aria-hidden="true"></i
            ></span>
          </a>
        }
      </div>
    </section>
    <section class="foundation-strip page-width" aria-label="Estado do projeto">
      <div>
        <span class="eyebrow">Um passo de cada vez</span>
        <p>
          Esta é a base visual do SingFlow. Sessões, pedidos e convocações chegam nos próximos
          incrementos.
        </p>
      </div>
      <app-backend-status />
    </section>
  `,
})
export class HomePage {
  readonly bars = [14, 25, 39, 53, 32, 62, 43, 28, 48, 35, 19];
  readonly roles = [
    {
      path: '/participante',
      title: 'Quero cantar',
      description:
        'Seu próximo momento no palco começa por aqui. Check-in, músicas e acompanhamento da sua vez.',
      icon: 'pi-microphone',
      color: 'purple',
    },
    {
      path: '/anfitriao',
      title: 'Vou organizar',
      description:
        'Tudo para conduzir uma noite especial. Sessão, solicitações e convocações em um só lugar.',
      icon: 'pi-users',
      color: 'navy',
    },
    {
      path: '/musico',
      title: 'Vou fazer o som',
      description:
        'Conexão com o que acontece no palco. Repertório e convocações para acompanhar cada voz.',
      icon: 'pi-headphones',
      color: 'yellow',
    },
  ];
}
