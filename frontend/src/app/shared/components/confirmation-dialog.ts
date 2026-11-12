import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, ElementRef, inject, input, OnDestroy, output, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DialogModule } from 'primeng/dialog';

/** Common modal shell. Domain actions and errors remain owned by the feature. */
@Component({
  selector: 'app-confirmation-dialog',
  host: { '(document:keydown.escape)': 'escape($event)' },
  imports: [DialogModule, CdkTrapFocus],
  template: `
    <p-dialog
      #modal
      [header]="title()"
      [visible]="true"
      (visibleChange)="visibilityChanged($event)"
      [modal]="true"
      [closable]="false"
      [closeOnEscape]="false"
      [dismissableMask]="false"
      [draggable]="false"
      [resizable]="false"
      [blockScroll]="true"
      [focusTrap]="false"
      [focusOnShow]="false"
      appendTo="body"
      [styleClass]="fullscreen() ? 'sf-confirm-dialog sf-song-fullscreen' : 'sf-confirm-dialog'"
      (onShow)="focusTitle()"
    >
      <ng-template #headless>
        <div cdkTrapFocus [cdkTrapFocusAutoCapture]="true" class="sf-dialog-frame">
          <div class="p-dialog-header">
            <ng-content select="[dialog-leading]" />
            <h2 #titleElement cdkFocusInitial [id]="modal.ariaLabelledBy()" tabindex="-1">
              {{ title() }}
            </h2>
            <ng-content select="[dialog-actions]" />
          </div>
          <div class="p-dialog-content">
            @if (error()) {
              <p class="sf-dialog-error" role="alert">{{ error() }}</p>
            }
            <ng-content />
          </div>
          <ng-content select="[dialog-footer]" />
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class ConfirmationDialog implements OnDestroy {
  readonly title = input.required<string>();
  readonly fullscreen = input(false);
  readonly busy = input(false);
  readonly error = input('');
  readonly returnFocus = input<string>();
  readonly dismissed = output<void>();
  private readonly document = inject(DOCUMENT);
  private readonly opener = this.document.activeElement as HTMLElement | null;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('titleElement');
  focusTitle() {
    this.heading()?.nativeElement.focus();
  }
  escape(event: Event) {
    const dialogs = this.document.querySelectorAll('.sf-confirm-dialog');
    const topDialog = dialogs.item(dialogs.length - 1);
    const heading = this.heading()?.nativeElement;
    if (!heading || !topDialog?.contains(heading)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.busy()) this.dismissed.emit();
  }
  visibilityChanged(visible: boolean) {
    if (!visible && !this.busy()) this.dismissed.emit();
  }
  ngOnDestroy() {
    const target =
      (this.returnFocus() ? this.document.getElementById(this.returnFocus()!) : null) ??
      this.opener;
    if (target?.isConnected) target.focus();
  }
}
