import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TabsModule } from 'primeng/tabs';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { SurfaceCard } from '../../shared/components/surface-card';
import { ApiClient, apiError } from '../../core/http/api-client';
import { createOperationId } from '../../shared/operation-id';
import { Notifications } from '../../shared/notifications';
import { PresentationEntry } from '../television/presentation-types';
@Component({
  selector: 'app-admin-branding',
  imports: [ReactiveFormsModule, InputTextModule, TabsModule, ConfirmationDialog, SurfaceCard],
  styles: `
    .brand-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px;
      border: 1px solid #dbe1ed;
      border-radius: 14px;
      margin-top: 12px;
    }
    .brand-row img {
      width: 64px;
      height: 64px;
      object-fit: contain;
    }
    .brand-row strong {
      flex: 1;
      overflow-wrap: anywhere;
    }
    .brand-preview {
      max-width: 100%;
      height: 120px;
      object-fit: contain;
      border-radius: 12px;
      background: #f4f6fa;
    }
    .brand-upload {
      display: grid;
      gap: 8px;
    }
    .brand-upload input {
      max-width: 100%;
    }
    .brand-empty {
      padding: 24px 0;
      color: #53637d;
    }
  `,
  template: `
    <app-surface-card labelledBy="branding-title">
      <h1 id="branding-title">Locais e projetos</h1>
      <p-tabs
        [value]="kind()"
        (valueChange)="kind.set($event === 'PROJECT' ? 'PROJECT' : 'VENUE')"
        class="sf-song-tabs sf-song-tabs-contained"
        ><p-tablist>
          <p-tab value="VENUE" aria-label="Locais" title="Locais"
            ><i class="fa-solid fa-location-dot" aria-hidden="true"></i
          ></p-tab>
          <p-tab value="PROJECT" aria-label="Projetos de karaokê" title="Projetos de karaokê"
            ><i class="fa-solid fa-guitar" aria-hidden="true"></i
          ></p-tab> </p-tablist
      ></p-tabs>
      <div class="host-form">
        <input
          pInputText
          aria-label="Buscar local ou projeto"
          placeholder="Buscar pelo nome"
          (input)="search.set($any($event.target).value)"
        />
        <button
          type="button"
          class="sf-button sf-primary sf-full"
          [disabled]="busy()"
          (click)="edit()"
        >
          <i class="fa-solid fa-plus" aria-hidden="true"></i
          >{{ kind() === 'VENUE' ? 'Cadastrar local' : 'Cadastrar projeto' }}
        </button>
      </div>
      @if (error() && !editing()) {
        <p class="sf-dialog-error" role="alert">{{ error() }}</p>
      }
      @for (row of filtered(); track row.id) {
        <div class="brand-row">
          @if (row.logoUrl) {
            <img [src]="row.logoUrl" alt="" />
          }
          <strong>{{ row.name }}</strong
          ><button
            type="button"
            class="sf-icon-button"
            [attr.aria-label]="'Editar ' + row.name"
            [disabled]="busy()"
            (click)="edit(row)"
          >
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
        </div>
      } @empty {
        <p class="brand-empty">
          {{ kind() === 'VENUE' ? 'Nenhum local cadastrado.' : 'Nenhum projeto cadastrado.' }}
        </p>
      }
    </app-surface-card>
    @if (editing(); as current) {
      <app-confirmation-dialog
        [title]="current.kind === 'VENUE' ? 'Cadastro do local' : 'Projeto de karaokê'"
        [busy]="busy()"
        [error]="error()"
        (dismissed)="editing.set(null)"
      >
        <form id="branding-form" class="host-form" [formGroup]="form" (ngSubmit)="save()">
          <label for="branding-name">{{
            current.kind === 'VENUE' ? 'Nome do local' : 'Nome do projeto'
          }}</label
          ><input id="branding-name" pInputText formControlName="name" maxlength="120" required />
          <label class="brand-upload" for="branding-logo"
            >Marca<input
              id="branding-logo"
              type="file"
              accept="image/png,image/jpeg"
              [disabled]="busy()"
              (change)="upload($event, false)"
          /></label>
          @if (logoUrl()) {
            <img class="brand-preview" [src]="logoUrl()" alt="Prévia da marca" />
          }
          @if (current.kind === 'VENUE') {
            <label class="brand-upload" for="branding-background"
              >Fundo para TV<input
                id="branding-background"
                type="file"
                accept="image/png,image/jpeg"
                [disabled]="busy()"
                (change)="upload($event, true)"
            /></label>
            @if (backgroundUrl()) {
              <img class="brand-preview" [src]="backgroundUrl()" alt="Prévia do fundo para TV" />
            }
          } @else {
            <label for="branding-instagram">Instagram (opcional)</label
            ><input
              id="branding-instagram"
              pInputText
              formControlName="instagram"
              placeholder="karaoke.somnacaixa"
              maxlength="30"
            />
          }
        </form>
        <div class="sf-dialog-actions" dialog-footer>
          <button
            type="submit"
            form="branding-form"
            class="sf-button sf-primary"
            [disabled]="busy() || form.invalid"
          >
            Salvar</button
          ><button
            type="button"
            class="sf-button sf-outline"
            [disabled]="busy()"
            (click)="editing.set(null)"
          >
            Fechar
          </button>
        </div>
      </app-confirmation-dialog>
    }
  `,
})
export class AdminBranding implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(Notifications);
  readonly kind = signal<'VENUE' | 'PROJECT'>('VENUE');
  readonly search = signal('');
  readonly rows = signal<PresentationEntry[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly editing = signal<PresentationEntry | null>(null);
  readonly logoUrl = signal('');
  readonly backgroundUrl = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    instagram: ['', Validators.pattern(/^@?[A-Za-z0-9_.]{0,30}$/)],
  });
  readonly filtered = computed(() =>
    this.rows().filter(
      (row) =>
        row.kind === this.kind() &&
        row.name.toLocaleLowerCase().includes(this.search().toLocaleLowerCase()),
    ),
  );
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      this.rows.set(await this.api.get<PresentationEntry[]>('/admin/branding'));
    } catch (e) {
      this.error.set(apiError(e));
    }
  }
  edit(row?: PresentationEntry) {
    this.error.set('');
    const value = row ?? {
      id: createOperationId(),
      kind: this.kind(),
      name: '',
      logoId: null,
      logoUrl: null,
      backgroundId: null,
      backgroundUrl: null,
      instagram: '',
      version: 0,
    };
    this.editing.set({ ...value });
    this.form.setValue({ name: value.name, instagram: value.instagram ?? '' });
    this.logoUrl.set(value.logoUrl ?? '');
    this.backgroundUrl.set(value.backgroundUrl ?? '');
  }
  async upload(event: Event, background: boolean) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.editing()) return;
    if (file.size > 6 * 1024 * 1024) {
      this.error.set('Envie PNG ou JPEG de até 6 MB.');
      input.value = '';
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.post<{ id: string; url: string }>(
        '/admin/branding/assets?background=' + background,
        await file.arrayBuffer(),
        { 'Content-Type': file.type },
      );
      this.editing.update((value) =>
        value
          ? {
              ...value,
              ...(background
                ? { backgroundId: result.id, backgroundUrl: result.url }
                : { logoId: result.id, logoUrl: result.url }),
            }
          : null,
      );
      (background ? this.backgroundUrl : this.logoUrl).set(result.url);
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }
  async save() {
    const row = this.editing();
    if (!row || this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post('/admin/branding', {
        id: row.id,
        kind: row.kind,
        name: this.form.controls.name.value,
        logoId: row.logoId,
        backgroundId: row.kind === 'VENUE' ? row.backgroundId : null,
        instagram: row.kind === 'PROJECT' ? this.form.controls.instagram.value : '',
        version: row.version,
      });
      this.editing.set(null);
      await this.load();
      this.notifications.success('Cadastro salvo.');
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
