import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SurfaceCard } from '../../shared/components/surface-card';
import { privacyEmail, publicDocumentLinks, publicDocuments } from './public-documents';

@Component({
  imports: [RouterLink, SurfaceCard],
  styles: `
    :host {
      display: block;
    }
    .public-document {
      max-width: 860px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    .public-document h1 {
      font-size: clamp(26px, 5vw, 36px);
      margin: 0 0 12px;
    }
    .public-document h2 {
      font-size: 21px;
      margin: 28px 0 10px;
    }
    .public-document p,
    .public-document li {
      line-height: 1.8;
      overflow-wrap: anywhere;
    }
    .public-document li + li {
      margin-top: 10px;
    }
    .public-document ul {
      padding-left: 22px;
    }
    .document-date {
      font-size: 13px;
      color: var(--sf-muted);
    }
    .document-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 20px;
      margin-top: 24px;
    }
    .document-links a {
      color: var(--sf-navy, #0b1e3f);
      padding: 6px 0;
    }
    .public-document a:focus-visible {
      outline: 3px solid var(--sf-purple, #7c3aed);
      outline-offset: 4px;
    }
  `,
  template: `<article class="public-document" [attr.aria-labelledby]="'document-title'">
    <a class="sf-button sf-text" routerLink="/"
      ><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Início</a
    >
    <app-surface-card labelledBy="document-title">
      <h1 id="document-title">{{ document.title }}</h1>
      <p class="document-date">Atualizado em 18 de novembro de 2026</p>
      <p>{{ document.introduction }}</p>
      @for (section of document.sections; track section.title) {
        <section>
          <h2>{{ section.title }}</h2>
          @for (paragraph of section.paragraphs ?? []; track $index) {
            <p>{{ paragraph }}</p>
          }
          @if (section.items) {
            <ul>
              @for (item of section.items; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          }
        </section>
      }
      @if (key === 'deletion') {
        <a class="sf-button sf-primary" [href]="deletionEmail">Solicitar exclusão por e-mail</a>
      } @else {
        <a [href]="'mailto:' + email">{{ email }}</a>
      }
      @if (key === 'callback') {
        <div class="sf-dialog-actions">
          <a class="sf-button sf-primary" routerLink="/minha-conta">Minha conta e avisos</a>
        </div>
      }
      @if (key === 'rights') {
        <p>
          <a
            href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares"
            target="_blank"
            rel="noopener noreferrer"
            >Direitos dos titulares — ANPD
            <i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i
          ></a>
        </p>
      }
      <nav class="document-links" aria-label="Informações do SingFlow">
        @for (link of links; track link.path) {
          @if (link.key !== key) {
            <a [routerLink]="link.path">{{ link.label }}</a>
          }
        }
      </nav>
    </app-surface-card>
  </article>`,
})
export class PublicDocumentPage {
  readonly key = inject(ActivatedRoute).snapshot.data['document'] as string;
  readonly document = publicDocuments[this.key];
  readonly links = publicDocumentLinks;
  readonly email = privacyEmail;
  readonly deletionEmail =
    'mailto:' +
    privacyEmail +
    '?subject=' +
    encodeURIComponent('Exclusão de dados pessoais — SingFlow');
}
