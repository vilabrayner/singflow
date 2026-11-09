import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  imports: [RouterLink],
  template: `<section class="role-page page-width">
    <p class="eyebrow">404</p>
    <h1>Página não encontrada</h1>
    <p>Esse endereço não faz parte do show.</p>
    <a routerLink="/" class="card-link">Voltar ao início</a>
  </section>`,
})
export class NotFoundPage {}
