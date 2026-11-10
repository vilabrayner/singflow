import { Component, input } from '@angular/core';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-options-menu',
  imports: [MenuModule],
  template: `
    <button
      type="button"
      class="sf-icon-button"
      [id]="buttonId()"
      [attr.aria-label]="label()"
      [title]="label()"
      aria-haspopup="menu"
      [attr.aria-controls]="buttonId() + '-menu'"
      [attr.aria-expanded]="menu.visible()"
      [disabled]="disabled()"
      (click)="menu.toggle($event)"
    >
      <i class="pi pi-ellipsis-h" aria-hidden="true"></i>
    </button>
    <p-menu
      #menu
      [id]="buttonId() + '-menu'"
      [popup]="true"
      [model]="items()"
      [ariaLabel]="label()"
      appendTo="body"
      styleClass="sf-options-popup"
    />
  `,
})
export class OptionsMenu {
  readonly buttonId = input.required<string>();
  readonly label = input.required<string>();
  readonly items = input.required<MenuItem[]>();
  readonly disabled = input(false);
}
