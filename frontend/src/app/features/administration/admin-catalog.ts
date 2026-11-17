import { StreamingSearch } from '../../shared/components/streaming-search';
import { ChordLink, ChordLinkDialog } from '../../shared/components/chord-link-dialog';
import { StreamingLink } from '../../shared/streaming';
import { CatalogSync } from './catalog-sync';
import {
  afterNextRender,
  Injector,
  viewChild,
  viewChildren,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
  input,
  effect,
  ElementRef,
} from '@angular/core';
import { NgTemplateOutlet, DatePipe } from '@angular/common';
import { TabsModule } from 'primeng/tabs';
import { ScrollAreaModule } from 'primeng/scrollarea';
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
  id: string | null;
  selectionToken?: string;
  title: string;
  artist: string;
  status: string;
  source: string;
  mergedInto: string | null;
  originalKey?: string | null;
  version: number;
}
interface SongDetails {
  song: Song;
  chord: ChordLink;
  streaming: StreamingLink[];
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
    NgTemplateOutlet,
    ChordLinkDialog,
    StreamingSearch,
    CatalogSync,
    TabsModule,
    ScrollAreaModule,
    DatePipe,
    ReactiveFormsModule,
    InputTextModule,
    SurfaceCard,
    ConfirmationDialog,
    OptionsMenu,
    StatusBadge,
  ],
  templateUrl: './admin-catalog.html',
  styleUrls: ['../../shared/styles/admin-collections.css', './admin-catalog.css'],
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
  private readonly catalogSearch = viewChild<ElementRef<HTMLInputElement>>('catalogSearch');
  focusSearch() {
    // Synchronous with the tap so mobile browsers can open the keyboard.
    if (!this.busy()) this.catalogSearch()?.nativeElement.focus({ preventScroll: true });
  }
  private readonly viewport = viewChild('catalogViewport', { read: ElementRef<HTMLElement> });
  private focus() {
    afterNextRender(() => this.dialog()?.focusTitle(), { injector: this.injector });
  }
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notify = inject(Notifications);
  private readonly base = '/admin/catalog/songs';
  private searchTimer?: ReturnType<typeof setTimeout>;
  private nextSource = 'catalog';
  private nextPage = 0;
  private readonly importOperations = new Map<string, string>();
  readonly hasMore = signal(false);
  readonly searchMessage = signal('');
  readonly deleting = signal<Song | null>(null);
  songKey(song: Song) {
    return `${song.title.trim().toLocaleLowerCase()}|${song.artist?.trim().toLocaleLowerCase() ?? ''}`;
  }
  search(value: string) {
    if (this.busy()) return;
    this.detailsAbort?.abort();
    clearTimeout(this.searchTimer);
    this.generation++;
    this.loading.set(false);
    this.filter.controls.q.setValue(value);
    this.rows.set([]);
    this.total.set(0);
    this.hasMore.set(false);
    this.nextSource = 'catalog';
    this.nextPage = 0;
    this.searchMessage.set(
      value.trim().length > 0 && value.trim().length < 3
        ? 'Digite pelo menos 3 caracteres para buscar.'
        : '',
    );
    if (!value.trim()) void this.load(0, false, false);
    else if (value.trim().length >= 3) this.searchTimer = setTimeout(() => void this.load(), 400);
  }
  loadMore() {
    if (!this.loading() && !this.busy() && this.hasMore()) void this.load(this.nextPage, true);
  }
  askDelete(song: Song) {
    if (song.id && !this.busy()) {
      this.error.set('');
      this.deleting.set(song);
    }
  }
  cancelDelete() {
    if (!this.busy()) {
      this.deleting.set(null);
      this.error.set('');
    }
  }
  async deleteSong() {
    const song = this.deleting();
    if (!song?.id || this.busy()) return;
    this.generation++;
    this.loading.set(false);
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post(`${this.base}/${song.id}/delete`, { version: song.version });
      if (this.destroyed) return;
      this.rows.update((rows) => rows.filter((row) => row.id !== song.id));
      this.deleting.set(null);
      this.notify.success('Música excluída do catálogo.');
      this.busy.set(false);
      await this.load();
    } catch (error) {
      if (!this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
  async importSong(song: Song) {
    if (song.id || !song.selectionToken || this.busy()) return;
    const key = this.songKey(song) + '|' + song.selectionToken;
    if (!this.importOperations.has(key)) this.importOperations.set(key, createOperationId());
    this.generation++;
    this.loading.set(false);
    this.busy.set(true);
    this.error.set('');
    try {
      const saved = await this.api.post<Song>(`${this.base}/from-internet`, {
        operationId: this.importOperations.get(key),
        title: song.title,
        artist: song.artist,
        selectionToken: song.selectionToken,
      });
      if (this.destroyed) return;
      const unique = new Map<string, Song>();
      for (const row of this.rows().map((row) =>
        this.songKey(row) === this.songKey(song) ? saved : row,
      ))
        unique.set(row.id ?? this.songKey(row), row);
      this.rows.set([...unique.values()]);
      this.notify.success('Música cadastrada no catálogo.');
    } catch (error) {
      if (!this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
  readonly filter = this.fb.group({ q: [''], status: [''] });
  readonly active = input(true);
  constructor() {
    effect(() => {
      if (!this.active()) this.showingSync.set(false);
    });
  }
  readonly showingSync = signal(false);
  selectTab(value: string | number | undefined) {
    if (this.busy() || !['catalog', 'sync'].includes(String(value))) return;
    if (value === 'sync') this.showingSync.set(true);
    else if (this.showingSync()) this.closeSync();
  }
  clearSearch() {
    this.search('');
  }
  closeSync() {
    this.showingSync.set(false);
    void this.load();
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
    originalKey: ['', [Validators.pattern(/^[A-G](#|b)?m?$/), Validators.maxLength(4)]],
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
  readonly editorTab = signal<string | number>('data');
  readonly chordEditor = viewChild(ChordLinkDialog);
  readonly streamingEditors = viewChildren(StreamingSearch);
  readonly editorDetails = signal<SongDetails | null>(null);
  readonly visitedEditorTabs = signal<string[]>(['data']);
  readonly referenceLoading = computed(() => {
    if (this.editorTab() === 'data') return false;
    const editor =
      this.editorTab() === 'chord'
        ? this.chordEditor()
        : this.streamingEditors().find((editor) => editor.providerType() === this.editorTab());
    return !editor || editor.loading() || editor.searching();
  });
  readonly resourceDrafts = signal<Record<string, { url: string; valid: boolean }>>({});
  readonly invalidReferences = computed(() =>
    Object.values(this.resourceDrafts()).some((draft) => !draft.valid),
  );
  updateReference(type: string, draft: { url: string; valid: boolean }) {
    this.resourceDrafts.update((all) => ({ ...all, [type]: draft }));
  }
  selectEditorTab(value: string | number | undefined) {
    if (value !== undefined && value !== this.editorTab() && !this.busy()) {
      this.visitedEditorTabs.update((tabs) =>
        tabs.includes(String(value)) ? tabs : [...tabs, String(value)],
      );
      this.editorTab.set(value);
    }
  }
  readonly detailMenu = computed(() =>
    this.selected()?.status === 'MERGED'
      ? [this.historyItem()]
      : [
          {
            label: 'Aprovar música',
            icon: 'fa-solid fa-check',
            command: () => this.ask('APPROVED'),
          },
          {
            label: 'Rejeitar música',
            icon: 'fa-solid fa-ban',
            command: () => this.ask('REJECTED'),
          },
          {
            label: 'Unificar duplicata',
            icon: 'fa-solid fa-object-group',
            command: () => this.ask('MERGE'),
          },
          this.historyItem(),
        ],
  );
  private operation = createOperationId();
  private generation = 0;
  private findGeneration = 0;
  private destroyed = false;
  private detailsAbort?: AbortController;
  ngOnInit() {
    void this.load();
  }
  ngOnDestroy() {
    clearTimeout(this.searchTimer);
    this.destroyed = true;
    this.generation++;
    this.findGeneration++;
  }
  private historyItem() {
    return {
      label: 'Histórico de alterações',
      icon: 'fa-solid fa-clock-rotate-left',
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
          DELETED: 'Música excluída',
          LASTFM_SELECTED: 'Música validada na internet',
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
  async load(page = 0, append = false, blocking = true) {
    if (this.busy() || this.destroyed) return;
    clearTimeout(this.searchTimer);
    const f = this.filter.getRawValue();
    const q = f.q.trim();
    if (q && q.length < 3) return;
    const generation = ++this.generation;
    if (!append) {
      this.nextSource = 'catalog';
      this.nextPage = 0;
      this.viewport()?.nativeElement.scrollTo({ top: 0 });
    }
    this.loading.set(true);
    this.error.set('');
    this.searchMessage.set('');
    try {
      let incoming: Song[];
      let nextSource = 'catalog',
        nextPage = page + 1,
        more = false;
      if (q) {
        const result = await this.api.get<{
          items: Song[];
          hasMore: boolean;
          nextSource: string;
          nextPage: number;
        }>(
          `${this.base}/search-page?q=${encodeURIComponent(q)}&status=${f.status}&source=${this.nextSource}&page=${append ? this.nextPage : 0}`,
          { blocking: false },
        );
        incoming = result.items;
        nextSource = result.nextSource;
        nextPage = result.nextPage;
        more = result.hasMore;
      } else {
        const result = await this.api.get<Page>(
          `${this.base}?q=&status=${f.status}&page=${page}&size=10`,
          { blocking },
        );
        incoming = result.items;
        more = (result.page + 1) * result.size < result.total;
        if (generation === this.generation) this.total.set(result.total);
      }
      if (generation !== this.generation || this.destroyed) return;
      if (!Array.isArray(incoming)) throw new Error('Invalid catalogue');
      const unique = new Map<string, Song>();
      for (const song of [...(append ? this.rows() : []), ...incoming]) {
        const key = this.songKey(song);
        if (!unique.has(key)) unique.set(key, song);
      }
      this.rows.set([...unique.values()]);
      if (q) this.total.set(this.rows().length);
      this.hasMore.set(more);
      this.nextSource = nextSource;
      this.nextPage = nextPage;
      this.page.set(page);
      this.searchMessage.set(
        q && !this.rows().length
          ? 'Nenhuma música encontrada. Você pode cadastrar manualmente.'
          : '',
      );
    } catch (error) {
      if (generation === this.generation && !this.destroyed) this.failed(error);
    } finally {
      if (generation === this.generation && !this.destroyed) this.loading.set(false);
    }
  }
  private failed(error: unknown) {
    this.error.set(apiError(error));
    if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
      this.deleting.set(null);
      this.rows.set([]);
      this.total.set(0);
      this.selected.set(null);
      this.creating.set(false);
      this.action.set('');
      this.history.set([]);
      this.targets.set([]);
    }
  }
  async open(song: Song) {
    if (!song.id || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    this.detailsAbort?.abort();
    const controller = new AbortController();
    this.detailsAbort = controller;
    try {
      const details = await this.api.get<SongDetails>(`${this.base}/${song.id}/details`, {
        signal: controller.signal,
      });
      if (this.destroyed || controller.signal.aborted) return;
      this.resourceDrafts.set({});
      this.editorDetails.set(details);
      this.visitedEditorTabs.set(['data']);
      this.editorTab.set('data');
      this.selected.set(details.song);
      this.creating.set(false);
      this.action.set('');
      this.form.reset({
        title: details.song.title,
        artist: details.song.artist,
        originalKey: details.song.originalKey ?? '',
      });
    } catch (error) {
      if (!this.destroyed && !controller.signal.aborted) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
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
    this.editorDetails.set(null);
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
    if (this.form.invalid || this.busy() || this.invalidReferences()) return;
    const selected = this.selected();
    await this.write(
      () =>
        this.api.post<Song>(selected ? `${this.base}/${selected.id}/details` : this.base, {
          ...this.form.getRawValue(),
          ...(selected
            ? {
                version: selected.version,
                references: Object.fromEntries(
                  Object.entries(this.resourceDrafts()).map(([type, draft]) => [type, draft.url]),
                ),
              }
            : { operationId: this.operation }),
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
      await this.load();
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
