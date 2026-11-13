import {
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  output,
  signal,
  afterNextRender,
  Injector,
  viewChild,
} from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
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

interface Run {
  id: string;
  status: string;
  startedBy: string;
  createdAt: string;
  message: string;
}
interface Counts {
  total: number;
  processed: number;
  automatic: number;
  approved: number;
  review: number;
  failed: number;
  skipped: number;
  queued: number;
  processing: number;
}
interface Progress {
  pendingReview?: number;
  run: Run;
  counts: Counts;
  currentTitle: string;
}
interface Item {
  id: string;
  runId: string;
  songId: string;
  title: string;
  artist: string;
  songVersion: number;
  state: string;
  revision: number;
  attempts: number;
  message: string;
  updatedAt: string;
}
interface Target {
  id: string;
  title: string;
  artist: string;
  status: string;
  version: number;
}
interface Candidate {
  position: number;
  title: string;
  artist: string;
  url: string;
  mbid: string;
  score: number;
  existing: Target | null;
}
interface Detail {
  item: Item;
  candidates: Candidate[];
}
interface Preview {
  item: Item;
  title: string;
  artist: string;
  url: string;
  mbid: string;
  existing: Target | null;
}
interface ItemPage {
  items: Item[];
  total: number;
  page: number;
  size: number;
}

@Component({
  selector: 'app-catalog-sync',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    InputTextModule,
    SurfaceCard,
    ConfirmationDialog,
    OptionsMenu,
    StatusBadge,
  ],
  templateUrl: './catalog-sync.html',
  styleUrls: ['../../shared/styles/admin-collections.css', './catalog-sync.css'],
})
export class CatalogSync implements OnInit, OnDestroy {
  readonly closed = output<void>();
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild<ConfirmationDialog>('reviewDialog');
  private readonly notifications = inject(Notifications);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly base = '/admin/catalog/sync';
  readonly runs = signal<Run[]>([]);
  readonly runId = signal('');
  readonly progress = signal<Progress | null>(null);
  readonly rows = signal<Item[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly view = signal<'activity' | 'review'>('activity');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly reviewError = signal('');
  readonly refineMessage = signal('');
  readonly starting = signal(false);
  readonly detail = signal<Detail | null>(null);
  readonly preview = signal<Preview | null>(null);
  readonly manual = signal(false);
  readonly position = signal<number | null>(null);
  readonly reviewForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    artist: ['', [Validators.required, Validators.maxLength(160)]],
  });
  readonly percent = computed(() => {
    const c = this.progress()?.counts;
    return c?.total ? Math.round((c.processed / c.total) * 100) : 0;
  });
  readonly active = computed(() =>
    this.runs().some((r) => r.status === 'RUNNING' || r.status === 'PAUSED'),
  );
  readonly reviewable = computed(() =>
    ['REVIEW', 'FAILED'].includes(this.detail()?.item.state ?? ''),
  );
  readonly reviewMenu = computed(() => [
    {
      label: 'Atualizar revisão',
      icon: 'fa-solid fa-rotate-right',
      command: () => void this.reloadDetail(),
    },
    ...(['REVIEW', 'FAILED', 'SKIPPED'].includes(this.detail()?.item.state ?? '')
      ? [
          {
            label: 'Consultar dados salvos',
            icon: 'fa-solid fa-rotate',
            command: () => void this.retry(),
          },
        ]
      : []),
  ]);
  private operation = createOperationId();
  private timer?: ReturnType<typeof setInterval>;
  private destroyed = false;
  private generation = 0;
  private detailGeneration = 0;
  private latestPending: number | null = null;
  private completedNavigation = false;
  private readonly completionCandidates = new Set<string>();
  private outstanding(progress: Progress) {
    const c = progress.counts;
    return progress.pendingReview ?? c.review + c.failed + c.queued + c.processing + c.skipped;
  }
  private completeIfReady(progress: Progress) {
    const pending = this.outstanding(progress);
    this.latestPending = pending;
    if (pending > 0 || progress.run.status === 'RUNNING')
      this.completionCandidates.add(progress.run.id);
    if (
      this.completedNavigation ||
      this.detail() ||
      this.starting() ||
      progress.run.status !== 'COMPLETED' ||
      pending > 0 ||
      progress.counts.queued > 0 ||
      progress.counts.processing > 0 ||
      !this.completionCandidates.has(progress.run.id)
    )
      return;
    this.completedNavigation = true;
    this.notifications.info('Sincronização finalizada com sucesso');
    this.closed.emit();
  }
  ngOnInit() {
    void this.loadRuns();
    this.timer = setInterval(() => {
      if (!this.document.hidden && !this.busy() && !this.loading()) void this.refresh();
    }, 2000);
  }
  ngOnDestroy() {
    if (
      !this.completedNavigation &&
      (this.latestPending ??
        (this.runs().some((r) => r.id === this.runId() && ['RUNNING', 'PAUSED'].includes(r.status))
          ? 1
          : 0)) > 0
    )
      this.notifications.warn('Existem músicas pendentes de revisão');
    this.destroyed = true;
    this.generation++;
    this.detailGeneration++;
    clearInterval(this.timer);
  }
  private focus() {
    afterNextRender(() => this.dialog()?.focusTitle(), { injector: this.injector });
  }
  status(value: string) {
    return (
      (
        {
          RUNNING: 'Em andamento',
          PAUSED: 'Pausada',
          COMPLETED: 'Consultas concluídas',
          QUEUED: 'Aguardando consulta',
          PROCESSING: 'Consultando',
          AUTO_APPROVED: 'Aprovada automaticamente',
          REVIEW: 'Precisa de revisão',
          APPROVED: 'Aprovada pelo admin',
          MERGED: 'Vinculada e aprovada',
          SKIPPED: 'Cadastro alterado',
          FAILED: 'Falha na consulta',
        } as Record<string, string>
      )[value] ?? value
    );
  }
  tone(state: string): 'positive' | 'attention' | 'neutral' {
    return ['AUTO_APPROVED', 'APPROVED', 'MERGED'].includes(state)
      ? 'positive'
      : ['REVIEW', 'FAILED'].includes(state)
        ? 'attention'
        : 'neutral';
  }
  private message(error: unknown) {
    return error instanceof HttpErrorResponse &&
      [409, 503].includes(error.status) &&
      typeof error.error?.detail === 'string'
      ? error.error.detail
      : apiError(error);
  }
  private failed(error: unknown, review = false) {
    (review ? this.reviewError : this.error).set(this.message(error));
    if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
      this.generation++;
      this.detailGeneration++;
      this.latestPending = null;
      this.runs.set([]);
      this.runId.set('');
      this.progress.set(null);
      this.rows.set([]);
      this.detail.set(null);
      this.preview.set(null);
      this.starting.set(false);
      this.loading.set(false);
      this.error.set(this.message(error));
    }
  }
  async loadRuns() {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const runs = await this.api.get<Run[]>(`${this.base}/runs`);
      if (this.destroyed || generation !== this.generation) return;
      this.progress.set(null);
      this.rows.set([]);
      this.runs.set(runs);
      this.runId.set(
        (runs.find((r) => r.status === 'RUNNING' || r.status === 'PAUSED') ?? runs[0])?.id ?? '',
      );
    } catch (error) {
      if (!this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed && generation === this.generation) this.loading.set(false);
    }
    if (!this.destroyed && generation === this.generation) await this.refresh();
  }
  selectRun(id: string) {
    if (this.busy()) return;
    this.generation++;
    this.loading.set(false);
    this.latestPending = null;
    this.runId.set(id);
    this.page.set(0);
    this.progress.set(null);
    this.rows.set([]);
    void this.refresh();
  }
  async refresh() {
    const id = this.runId();
    if (!id || this.busy() || this.loading() || this.destroyed) return;
    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const [progress, items] = await Promise.all([
        this.api.get<Progress>(`${this.base}/runs/${id}`),
        this.api.get<ItemPage>(
          `${this.base}/runs/${id}/items?view=${this.view()}&page=${this.page()}`,
        ),
      ]);
      if (generation !== this.generation || this.destroyed) return;
      this.progress.set(progress);
      this.rows.set(items.items);
      this.total.set(items.total);
      this.error.set('');
      this.runs.update((runs) => runs.map((r) => (r.id === id ? progress.run : r)));
      this.completeIfReady(progress);
    } catch (error) {
      if (generation === this.generation && !this.destroyed) this.failed(error);
    } finally {
      if (generation === this.generation && !this.destroyed) this.loading.set(false);
    }
  }
  setView(view: 'activity' | 'review') {
    this.generation++;
    this.loading.set(false);
    this.view.set(view);
    this.page.set(0);
    this.rows.set([]);
    void this.refresh();
  }
  paginate(page: number) {
    this.page.set(page);
    void this.refresh();
  }
  askStart() {
    this.operation = createOperationId();
    this.starting.set(true);
    this.error.set('');
  }
  async start() {
    if (this.busy()) return;
    this.generation++;
    this.loading.set(false);
    this.busy.set(true);
    this.error.set('');
    try {
      const run = await this.api.post<Run>(`${this.base}/runs`, { operationId: this.operation });
      if (this.destroyed) return;
      this.runs.update((rows) => [run, ...rows.filter((r) => r.id !== run.id)].slice(0, 20));
      this.completionCandidates.add(run.id);
      this.latestPending = null;
      this.runId.set(run.id);
      this.page.set(0);
      this.view.set('activity');
      this.starting.set(false);
      this.progress.set(null);
      this.rows.set([]);
    } catch (error) {
      if (!this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
    if (!this.destroyed) await this.refresh();
  }
  async control(action: 'pause' | 'resume') {
    if (this.busy() || !this.runId()) return;
    this.generation++;
    this.loading.set(false);
    this.busy.set(true);
    this.error.set('');
    try {
      const run = await this.api.post<Run>(`${this.base}/runs/${this.runId()}/${action}`);
      if (this.destroyed) return;
      this.runs.update((rows) => rows.map((r) => (r.id === run.id ? run : r)));
    } catch (error) {
      if (!this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
    if (!this.destroyed) await this.refresh();
  }
  async open(item: Item) {
    const generation = ++this.detailGeneration;
    this.reviewError.set('');
    this.preview.set(null);
    this.busy.set(true);
    try {
      const detail = await this.api.get<Detail>(`${this.base}/items/${item.id}`);
      if (generation !== this.detailGeneration || this.destroyed) return;
      this.detail.set(detail);
      this.position.set(null);
      this.manual.set(!detail.candidates.length);
      this.refineMessage.set('');
      this.reviewForm.reset({ title: detail.item.title, artist: detail.item.artist });
    } catch (error) {
      if (generation === this.detailGeneration && !this.destroyed) this.failed(error);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
  closeReview() {
    if (this.busy()) return;
    this.detailGeneration++;
    this.detail.set(null);
    this.preview.set(null);
    this.reviewError.set('');
  }
  choose(candidate: Candidate) {
    this.manual.set(false);
    this.position.set(candidate.position);
    this.preview.set(null);
    this.reviewError.set('');
  }
  editManual() {
    this.manual.set(true);
    this.position.set(null);
    this.preview.set(null);
    this.reviewError.set('');
  }
  async refine() {
    const item = this.detail()?.item;
    if (
      this.busy() ||
      !item ||
      !this.reviewable() ||
      !this.reviewForm.controls.title.value.trim() ||
      this.reviewForm.controls.title.invalid ||
      this.reviewForm.controls.artist.hasError('maxlength')
    )
      return;
    this.busy.set(true);
    this.reviewError.set('');
    this.preview.set(null);
    this.position.set(null);
    this.refineMessage.set('Buscando novamente no Last.fm…');
    try {
      const detail = await this.api.post<Detail>(`${this.base}/items/${item.id}/search`, {
        revision: item.revision,
        ...this.reviewForm.getRawValue(),
      });
      if (this.destroyed) return;
      this.detail.set(detail);
      this.manual.set(true);
      this.refineMessage.set(
        detail.candidates.length
          ? `${detail.candidates.length} correspondência(s) encontrada(s). Selecione uma opção ou use os dados manuais.`
          : 'Nenhuma correspondência encontrada. Você pode usar os dados manuais.',
      );
    } catch (error) {
      if (!this.destroyed) {
        this.failed(error, true);
        this.refineMessage.set(
          'A busca não foi concluída. Os dados digitados e as correspondências anteriores foram mantidos.',
        );
      }
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
  backToReview() {
    this.preview.set(null);
    this.reviewError.set('');
    this.focus();
  }
  private choice() {
    return {
      revision: this.detail()!.item.revision,
      position: this.manual() ? null : this.position(),
      ...(this.manual() ? this.reviewForm.getRawValue() : {}),
    };
  }
  async propose() {
    if (
      this.busy() ||
      !this.detail() ||
      !this.reviewable() ||
      (this.manual() ? this.reviewForm.invalid : this.position() === null)
    )
      return;
    this.busy.set(true);
    this.reviewError.set('');
    try {
      const preview = await this.api.post<Preview>(
        `${this.base}/items/${this.detail()!.item.id}/preview`,
        this.choice(),
      );
      if (!this.destroyed) {
        this.preview.set(preview);
        this.focus();
      }
    } catch (error) {
      if (!this.destroyed) this.failed(error, true);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
  async approve() {
    const preview = this.preview();
    if (this.busy() || !preview) return;
    this.generation++;
    this.loading.set(false);
    this.busy.set(true);
    this.reviewError.set('');
    let approved = false;
    try {
      await this.api.post<Detail>(`${this.base}/items/${preview.item.id}/approve`, {
        ...this.choice(),
        targetId: preview.existing?.id ?? null,
        targetVersion: preview.existing?.version ?? null,
      });
      if (!this.destroyed) {
        approved = true;
        this.busy.set(false);
        this.closeReview();
      }
    } catch (error) {
      if (!this.destroyed) this.failed(error, true);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
    if (!this.destroyed) await this.refresh();
    if (approved && !this.destroyed && !this.completedNavigation)
      this.notifications.success(
        preview.existing ? 'Música vinculada e aprovada.' : 'Música aprovada.',
      );
  }
  async reloadDetail() {
    const item = this.detail()?.item;
    if (item) await this.open(item);
  }
  async retry() {
    const item = this.detail()?.item;
    if (this.busy() || !item) return;
    this.busy.set(true);
    this.reviewError.set('');
    try {
      await this.api.post<Detail>(`${this.base}/items/${item.id}/retry`, {
        revision: item.revision,
      });
      if (!this.destroyed) {
        this.busy.set(false);
        this.closeReview();
        await this.loadRuns();
      }
    } catch (error) {
      if (!this.destroyed) this.failed(error, true);
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
}
