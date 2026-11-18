import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { ApiClient, apiError } from '../../core/http/api-client';
import { LinkClipboard } from '../../shared/link-clipboard';
import { Notifications } from '../../shared/notifications';
import { PresentationEntry, TelevisionConfiguration } from './presentation-types';
import { KaraokeSession } from '../sessions/session-api';
@Component({
  selector: 'app-television-settings',
  imports: [ConfirmationDialog, ReactiveFormsModule, SelectModule],
  template: `
    <button
      type="button"
      [class]="opening() ? 'sf-button sf-primary sf-full' : 'sf-button sf-text sf-full'"
      [disabled]="disabled()"
      (click)="open()"
    >
      <i [class]="opening() ? 'fa-solid fa-play' : 'fa-solid fa-tv'" aria-hidden="true"></i
      >{{ opening() ? 'Abrir sessão' : 'Tela da TV' }}
    </button>
    @if (showing()) {
      <app-confirmation-dialog
        [title]="opening() ? 'Preparar sessão' : 'Tela da TV'"
        [busy]="busy()"
        [error]="error()"
        (dismissed)="showing.set(false)"
      >
        <form id="tv-settings-form" class="host-form" [formGroup]="form" (ngSubmit)="save()">
          <label for="tv-venue">Local</label
          ><p-select
            inputId="tv-venue"
            ariaLabel="Local"
            [options]="venues()"
            optionLabel="name"
            optionValue="id"
            [filter]="true"
            filterBy="name"
            placeholder="Escolha o local"
            formControlName="venueId"
            appendTo="body"
          />
          <label for="tv-project">Projeto de karaokê</label
          ><p-select
            inputId="tv-project"
            ariaLabel="Projeto de karaokê"
            [options]="projects()"
            optionLabel="name"
            optionValue="id"
            [filter]="true"
            filterBy="name"
            placeholder="Escolha o projeto"
            formControlName="projectId"
            appendTo="body"
          />
          @if (!venues().length || !projects().length) {
            <p role="status">
              Peça ao admin para cadastrar os locais e projetos antes de abrir a sessão.
            </p>
          }
          <label style="display:flex;align-items:center;gap:12px"
            ><input type="checkbox" formControlName="enabled" />Liberar TV desta sessão</label
          >
          <p>A TV exibe publicamente nome, música e artista dos participantes desta sessão.</p>
        </form>
        @if (savedEnabled()) {
          <div class="sf-dialog-actions">
            <a
              class="sf-button sf-outline sf-full"
              [href]="url()"
              target="_blank"
              rel="noopener noreferrer"
              >Abrir TV<i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></a
            ><button class="sf-button sf-outline sf-full" type="button" (click)="copy()">
              Copiar link da TV
            </button>
          </div>
        }
        <div class="sf-dialog-actions" dialog-footer>
          <button
            class="sf-button sf-primary"
            type="submit"
            form="tv-settings-form"
            [disabled]="busy() || form.invalid"
          >
            {{ opening() ? 'Abrir sessão' : 'Salvar' }}</button
          ><button
            class="sf-button sf-outline"
            type="button"
            [disabled]="busy()"
            (click)="showing.set(false)"
          >
            Fechar
          </button>
        </div>
      </app-confirmation-dialog>
    }
  `,
})
export class TelevisionSettings {
  readonly session = input.required<string>();
  readonly disabled = input(false);
  readonly opening = input(false);
  readonly opened = output<KaraokeSession>();
  private readonly api = inject(ApiClient);
  private readonly clipboard = inject(LinkClipboard);
  private readonly notifications = inject(Notifications);
  readonly venues = signal<PresentationEntry[]>([]);
  readonly projects = signal<PresentationEntry[]>([]);
  readonly showing = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly savedEnabled = signal(false);
  private version = 0;
  readonly form = inject(FormBuilder).group({
    enabled: [false],
    venueId: ['', Validators.required],
    projectId: ['', Validators.required],
  });
  url() {
    return new URL('/tv/' + this.session(), location.origin).href;
  }
  async open() {
    this.busy.set(true);
    this.error.set('');
    this.showing.set(true);
    try {
      const [settings, options] = await Promise.all([
        this.api.get<TelevisionConfiguration>(`/sessions/${this.session()}/tv`),
        this.api.get<PresentationEntry[]>('/sessions/presentation-options'),
      ]);
      this.venues.set(options.filter((e) => e.kind === 'VENUE'));
      this.projects.set(options.filter((e) => e.kind === 'PROJECT'));
      this.form.setValue({
        enabled: settings.enabled,
        venueId: settings.venueId ?? '',
        projectId: settings.projectId ?? '',
      });
      this.version = settings.version;
      this.savedEnabled.set(settings.enabled);
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
    }
  }
  async save() {
    if (this.busy() || this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const value = this.form.getRawValue();
      if (this.opening()) {
        const session = await this.api.post<KaraokeSession>(
          `/sessions/${this.session()}/presentation/open`,
          { ...value, version: this.version },
        );
        this.showing.set(false);
        this.opened.emit(session);
      } else {
        const result = await this.api.post<TelevisionConfiguration>(
          `/sessions/${this.session()}/tv`,
          { ...value, version: this.version },
        );
        this.version = result.version;
        this.savedEnabled.set(result.enabled);
        this.notifications.success('Configuração da TV salva.');
      }
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
    }
  }
  async copy() {
    if (await this.clipboard.copy(this.url())) this.notifications.success('Link da TV copiado.');
    else this.error.set('Copie o endereço da TV pela barra do navegador.');
  }
}
