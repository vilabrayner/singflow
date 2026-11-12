import { CatalogSync } from './catalog-sync';
import {
  afterNextRender,
  Injector,
  viewChild,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ApiClient, apiError } from '../../core/http/api-client';
import { SurfaceCard } from '../../shared/components/surface-card';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { OptionsMenu } from '../../shared/components/options-menu';
import { StatusBadge } from '../../shared/components/status-badge';
import { Notifications } from '../../shared/notifications';
import { createOperationId } from '../../shared/operation-id';

interface Song {
  id: string;
  title: string;
  artist: string;
  status: string;
  source: string;
  mergedInto: string | null;
  version: number;
}
interface Page {
  items: Song[];
  total: number;
  page: number;
  size: number;
}
interface Event {
  actor: string;
  action: string;
  reason: string;
  occurredAt: string;
}

@Component({
  selector: 'app-admin-catalog',
  imports: [
    CatalogSync,
    DatePipe,
    ReactiveFormsModule,
    InputTextModule,
    SurfaceCard,
    ConfirmationDialog,
    OptionsMenu,
    StatusBadge,
  ],
  templateUrl: './admin-catalog.html',
  styleUrl: '../../shared/styles/admin-collections.css',
  styles: `
    :host {
      display: block;
    }
    .catalog-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      margin: 16px 0;
    }
    .catalog-radio {
      display: flex;
      gap: 12px;
      padding: 12px 0;
      align-items: center;
    }
    .catalog-radio input {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
    }
    .catalog-radio span {
      overflow-wrap: anywhere;
    }
    .catalog-list {
      list-style: none;
      padding: 0;
    }
    .catalog-list li {
      border-bottom: 1px solid var(--sf-border);
      padding: 12px 0;
    }
    .catalog-list p {
      margin: 6px 0;
    }
  `,
})
export class AdminCatalog implements OnInit, OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild(ConfirmationDialog);
  private focus() {
    afterNextRender(() => this.dialog()?.focusTitle(), { injector: this.injector });
  }
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notify = inject(Notifications);
  private readonly base = '/admin/catalog/songs';
  readonly filter = this.fb.group({ q: [''], status: [''] });
  readonly showingSync = signal(false);
  closeSync() {
    this.showingSync.set(false);
    void this.load(this.page());
  }
  readonly showingFilters = signal(false);
  readonly statusDraft = this.fb.control('');
  readonly filterLabel = computed(
    () =>
      (
        ({
          PENDING: 'Provisórias',
          APPROVED: 'Aprovadas',
          REJECTED: 'Rejeitadas',
          MERGED: 'Unificadas',
        }) as Record<string, string>
      )[this.appliedStatus()] ?? 'Todas',
  );
  private readonly appliedStatus = signal('');
  openFilters() {
    this.statusDraft.setValue(this.filter.controls.status.value);
    this.showingFilters.set(true);
  }
  applyFilters() {
    this.filter.controls.status.setValue(this.statusDraft.value);
    this.appliedStatus.set(this.statusDraft.value);
    this.showingFilters.set(false);
    void this.load();
  }
  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', [Validators.maxLength(160)]],
  });
  readonly reason = this.fb.control('');
  readonly mergeQuery = this.fb.control('');
  readonly rows = signal<Song[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly selected = signal<Song | null>(null);
  readonly creating = signal(false);
  readonly action = signal<'' | 'APPROVED' | 'REJECTED' | 'MERGE' | 'HISTORY'>('');
  readonly history = signal<Event[]>([]);
  readonly targets = signal<Song[]>([]);
  readonly target = signal<Song | null>(null);
  readonly finding = signal(false);
  readonly editable = computed(() => this.selected()?.status !== 'MERGED');
  readonly detailMenu = computed(() =>
    this.selected()?.status === 'MERGED'
      ? [this.historyItem()]
      : [
          { label: 'Aprovar música', icon: 'pi pi-check', command: () => this.ask('APPROVED') },
          { label: 'Rejeitar música', icon: 'pi pi-ban', command: () => this.ask('REJECTED') },
          { label: 'Unificar duplicata', icon: 'pi pi-clone', command: () => this.ask('MERGE') },
          this.historyItem(),
        ],
  );
  private operation = createOperationId();
  private generation = 0;
  private findGeneration = 0;
  private destroyed = false;
  ngOnInit() {
    void this.load();
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.generation++;
    this.findGeneration++;
  }
  private historyItem() {
    return {
      label: 'Histórico de alterações',
      icon: 'pi pi-history',
      command: () => void this.showHistory(),
    };
  }
  status(value: string) {
    return (
      (
        {
          PENDING: 'Provisória',
          APPROVED: 'Aprovada',
          REJECTED: 'Rejeitada',
          MERGED: 'Unificada',
        } as Record<string, string>
      )[value] ?? value
    );
  }
  event(value: string) {
    return (
      (
        {
          CREATED: 'Cadastro criado',
          IMPORTED: 'Histórico importado',
          EDITED: 'Dados corrigidos',
          APPROVED: 'Música aprovada',
          REJECTED: 'Música rejeitada',
          MERGED: 'Duplicata unificada',
        } as Record<string, string>
      )[value] ?? value
    );
  }
  source(value: string) {
    return (
      (
        {
          LEGACY: 'Histórico de sessões',
          REQUEST: 'Pedido ou apresentação',
          ADMIN: 'Cadastro administrativo',
        } as Record<string, string>
      )[value] ?? value
    );
  }
  async load(page = 0) {
    if (this.busy() || this.destroyed) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    const f = this.filter.getRawValue();
    try {
      const result = await this.api.get<Page>(
        `${this.base}?q=${encodeURIComponent(f.q.trim())}&status=${f.status}&page=${page}`,
      );
      if (generation !== this.generation || this.destroyed) return;
      this.rows.set(result.items);
      this.total.set(result.total);
      this.page.set(result.page);
    } catch (error) {
      if (generation === this.generation && !this.destroyed) this.failed(error);
    } finally {
      if (generation === this.generation && !this.destroyed) this.loading.set(false);
    }
  }
  private failed(error: unknown) {
    this.error.set(apiError(error));
    if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
      this.rows.set([]);
      this.total.set(0);
      this.selected.set(null);
      this.creating.set(false);
      this.action.set('');
      this.history.set([]);
      this.targets.set([]);
    }
  }
  open(song: Song) {
    this.error.set('');
    this.selected.set(song);
    this.creating.set(false);
    this.action.set('');
    this.form.reset({ title: song.title, artist: song.artist });
  }
  create() {
    this.error.set('');
    this.operation = createOperationId();
    this.selected.set(null);
    this.creating.set(true);
    this.form.reset();
  }
  close() {
    if (this.busy()) return;
    this.finding.set(false);
    this.findGeneration++;
    this.selected.set(null);
    this.creating.set(false);
    this.action.set('');
    this.targets.set([]);
    this.target.set(null);
    this.history.set([]);
    this.error.set('');
  }
  ask(action: 'APPROVED' | 'REJECTED' | 'MERGE') {
    this.finding.set(false);
    this.findGeneration++;
    this.action.set(action);
    this.focus();
    this.reason.reset('');
    this.target.set(null);
    this.targets.set([]);
    this.mergeQuery.reset('');
    this.error.set('');
  }
  back() {
    if (this.busy()) return;
    this.focus();
    this.findGeneration++;
    this.action.set('');
    this.error.set('');
    this.history.set([]);
    this.finding.set(false);
  }
  async save() {
    if (this.form.invalid || this.busy()) return;
    const selected = this.selected();
    await this.write(
      () =>
        this.api.post<Song>(selected ? `${this.base}/${selected.id}` : this.base, {
          ...this.form.getRawValue(),
          ...(selected ? { version: selected.version } : { operationId: this.operation }),
        }),
      'Música salva no catálogo.',
    );
  }
  async decide() {
    const song = this.selected();
    const action = this.action();
    const reason = (this.reason.value ?? '').trim();
    if (!song || this.busy() || !['APPROVED', 'REJECTED', 'MERGE'].includes(action)) return;
    if ((action === 'REJECTED' || action === 'MERGE') && !reason) {
      this.error.set('Informe o motivo.');
      return;
    }
    const target = this.target();
    if (action === 'MERGE' && !target) return;
    await this.write(
      () =>
        this.api.post<Song>(`${this.base}/${song.id}/${action === 'MERGE' ? 'merge' : 'review'}`, {
          version: song.version,
          reason,
          ...(action === 'MERGE'
            ? { targetId: target!.id, targetVersion: target!.version }
            : { status: action }),
        }),
      action === 'MERGE'
        ? 'Duplicata unificada. O histórico foi preservado.'
        : 'Revisão registrada.',
    );
  }
  private async write(request: () => Promise<Song>, message: string) {
    this.generation++;
    this.busy.set(true);
    this.loading.set(false);
    this.error.set('');
    try {
      await request();
      if (this.destroyed) return;
      this.notify.success(message);
      this.busy.set(false);
      this.close();
      await this.load(this.page());
    } catch (error) {
      if (!this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
  async findTargets() {
    const q = this.mergeQuery.value.trim();
    if (q.length < 3 || this.finding() || this.busy()) return;
    const generation = ++this.findGeneration;
    this.finding.set(true);
    this.target.set(null);
    this.error.set('');
    try {
      const result = await this.api.get<Page>(
        `${this.base}?q=${encodeURIComponent(q)}&status=APPROVED&page=0`,
      );
      if (generation !== this.findGeneration || this.destroyed) return;
      this.targets.set(result.items.filter((s) => s.id !== this.selected()?.id));
    } catch (error) {
      if (generation === this.findGeneration && !this.destroyed) this.failed(error);
    } finally {
      if (generation === this.findGeneration && !this.destroyed) this.finding.set(false);
    }
  }
  async showHistory() {
    const song = this.selected();
    if (!song || this.busy()) return;
    this.action.set('HISTORY');
    this.focus();
    this.history.set([]);
    this.error.set('');
    this.busy.set(true);
    try {
      const history = await this.api.get<Event[]>(`${this.base}/${song.id}/history`);
      if (!this.destroyed) this.history.set(history);
    } catch (error) {
      if (!this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
}
