import { Component, computed, input, signal, viewChild, ElementRef, inject } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin, Overlay } from '@angular/cdk/overlay';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { SpeedDialModule } from 'primeng/speeddial';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-actions-speed-dial',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus, SpeedDialModule],
  template: ` <button
      #trigger
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      type="button"
      class="sf-icon-button sf-menu-trigger"
      [id]="buttonId()"
      [attr.aria-label]="label()"
      aria-haspopup="menu"
      [attr.aria-controls]="opened() ? buttonId() + '-dial_list' : null"
      [attr.aria-expanded]="opened()"
      [disabled]="disabled()"
      (click)="open()"
    >
      <i class="fa-solid fa-bars" aria-hidden="true"></i>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="opened()"
      [cdkConnectedOverlayScrollStrategy]="scrollStrategy"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayViewportMargin]="16"
      (overlayKeydown)="$event.key === 'Escape' && close()"
    >
      <div
        class="sf-speed-dial-layer"
        [style.--sf-speed-dial-space]="availableSpace() + 'px'"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
      >
        <p-speeddial
          [id]="buttonId() + '-dial'"
          [model]="commands()"
          [pt]="{ item: { role: 'none' } }"
          type="linear"
          [direction]="direction()"
          [style]="{
            position: 'absolute',
            right: '0',
            top: direction() === 'down' ? '0' : 'auto',
            bottom: direction() === 'up' ? '0' : 'auto',
            width: '104px',
            alignItems: 'flex-end',
          }"
          [mask]="true"
          [visible]="true"
          (visibleChange)="!$event && close()"
          [hideOnClickOutside]="false"
          [ariaLabel]="label()"
          [maskStyle]="{
            position: 'fixed',
            inset: '0',
            width: '100vw',
            height: '100dvh',
            background: 'var(--p-mask-background, rgb(0 0 0 / 40%))',
            zIndex: '-1',
            pointerEvents: 'auto',
          }"
        >
          <ng-template #button>
            <button
              type="button"
              class="sf-icon-button sf-menu-trigger"
              [attr.aria-label]="'Fechar ' + label()"
              (click)="close()"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </ng-template>
          <ng-template #item let-item let-toggle="toggleCallback">
            <button
              type="button"
              class="sf-speed-dial-action"
              role="menuitem"
              (keydown.enter)="$event.stopPropagation()"
              (keydown.space)="$event.stopPropagation()"
              [attr.aria-label]="item.label"
              [disabled]="item.disabled"
              (click)="toggle($event, item)"
            >
              <i [class]="item.icon" aria-hidden="true"></i><span>{{ item.label }}</span>
            </button>
          </ng-template>
        </p-speeddial>
      </div>
    </ng-template>`,
  styles: `
    .sf-speed-dial-layer {
      position: relative;
      width: 48px;
      height: 48px;
    }
    .sf-speed-dial-action {
      width: 104px;
      min-height: 64px;
      padding: 10px 6px;
      border: 1px solid var(--sf-border);
      border-radius: 16px;
      background: white;
      color: var(--sf-navy);
      box-shadow: 0 6px 20px #0b1e3f25;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font: inherit;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }
    .sf-speed-dial-action :is(.fa-solid, .fa-regular, .fa-brands) {
      font-size: 22px;
      color: var(--sf-purple);
    }
    ::ng-deep .sf-speed-dial-layer .p-speeddial-list {
      max-height: var(--sf-speed-dial-space);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 4px;
      margin-right: -4px;
    }
    .sf-speed-dial-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .sf-speed-dial-action:focus-visible {
      outline: 3px solid var(--sf-purple);
      outline-offset: 3px;
    }
  `,
  host: { '(document:click)': 'backdrop($event)' },
})
export class ActionsSpeedDial {
  readonly buttonId = input.required<string>();
  readonly label = input.required<string>();
  readonly items = input.required<MenuItem[]>();
  readonly disabled = input(false);
  readonly opened = signal(false);
  readonly direction = signal<'up' | 'down'>('down');
  readonly availableSpace = signal(240);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly scrollStrategy = inject(Overlay).scrollStrategies.block();
  readonly positions = [
    {
      originX: 'end' as const,
      originY: 'top' as const,
      overlayX: 'end' as const,
      overlayY: 'top' as const,
    },
  ];
  readonly commands = computed(() =>
    this.items().map((item) => ({
      ...item,
      command: (event: Parameters<NonNullable<MenuItem['command']>>[0]) => {
        this.close();
        item.command?.(event);
      },
    })),
  );
  open() {
    const button = this.trigger()?.nativeElement;
    if (!button) return;
    const document = button.ownerDocument;
    const window = document.defaultView!;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = Math.max(
      viewport?.offsetTop ?? 0,
      document.querySelector('app-panel-header')?.getBoundingClientRect().bottom ?? 0,
    );
    const bottom = Math.min(
      (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
      document.querySelector('.sf-bottom-navigation')?.getBoundingClientRect().top ??
        window.innerHeight,
    );
    const below = Math.max(0, bottom - rect.bottom - 16);
    const above = Math.max(0, rect.top - top - 16);
    const needed = this.items().filter((item) => item.visible !== false).length * 76 + 8;
    const up = below < needed && above > below;
    this.direction.set(up ? 'up' : 'down');
    this.availableSpace.set(up ? above : below);
    button.focus({ preventScroll: true });
    this.opened.set(true);
  }
  close() {
    this.opened.set(false);
    this.trigger()?.nativeElement.focus({ preventScroll: true });
  }
  backdrop(event: Event) {
    if ((event.target as HTMLElement)?.classList?.contains('p-speeddial-mask')) this.close();
  }
}
