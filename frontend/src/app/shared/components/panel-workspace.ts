import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { PullRefresh } from '../pull-refresh';
import { ScrollAreaModule } from 'primeng/scrollarea';
import { BottomNavigation, BottomNavigationItem } from './bottom-navigation';

/** Fixed panel geometry shared by read-only and administrative workspaces. */
@Component({
  selector: 'app-panel-workspace',
  imports: [ScrollAreaModule, BottomNavigation, PullRefresh],
  styleUrl: '../styles/panel-workspace.css',
  template: `
    <div class="sf-workspace" [style.--workspace-dock-height]="dockHeight() + 'px'">
      <p-scrollarea variant="scroll" class="sf-workspace-scrollarea">
        <p-scrollarea-viewport
          #viewport
          [appPullRefresh]="refresh()"
          [pullRefreshDisabled]="disabled()"
          role="region"
          [attr.aria-label]="activeLabel()"
          class="sf-workspace-viewport"
        >
          <p-scrollarea-content class="sf-workspace-content" [class.sf-workspace-fill]="fill()"
            ><ng-content
          /></p-scrollarea-content>
        </p-scrollarea-viewport>
        <p-scrollarea-scrollbar orientation="vertical"
          ><p-scrollarea-handle
        /></p-scrollarea-scrollbar>
      </p-scrollarea>
    </div>
    <app-bottom-navigation
      [items]="items()"
      [value]="value()"
      [disabled]="disabled()"
      [label]="label()"
      (valueChange)="select($event)"
      (heightChange)="dockHeight.set($event)"
    />
  `,
})
export class PanelWorkspace {
  readonly items = input.required<BottomNavigationItem[]>();
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly resetKey = input('');
  readonly fill = input(false);
  readonly refresh = input<(() => Promise<unknown>) | null>(null);
  readonly valueChange = output<string>();
  readonly dockHeight = signal(64);
  readonly activeLabel = computed(
    () => this.items().find((item) => item.value === this.value())?.label ?? this.label(),
  );
  private readonly viewport = viewChild('viewport', { read: ElementRef<HTMLElement> });
  private readonly injector = inject(Injector);
  private readonly positions = new Map<string, number>();
  private previous = '';
  private previousKey = '';
  select(value: string) {
    const viewport = this.viewport()?.nativeElement;
    if (viewport) this.positions.set(this.value(), viewport.scrollTop);
    this.valueChange.emit(value);
  }
  constructor() {
    effect(() => {
      const value = this.value();
      const key = this.resetKey();
      const viewport = this.viewport()?.nativeElement;
      if (!viewport) return;
      if (key !== this.previousKey) {
        this.positions.clear();
        this.previous = '';
        this.previousKey = key;
      }
      if (value === this.previous) return;
      this.previous = value;
      // Do not overwrite a scroll initiated while the next render is pending.
      const beforeRender = viewport.scrollTop;
      afterNextRender(
        () => {
          if (
            value === this.value() &&
            key === this.resetKey() &&
            viewport.scrollTop === beforeRender
          )
            viewport.scrollTop = this.positions.get(value) ?? 0;
        },
        { injector: this.injector },
      );
    });
  }
}
