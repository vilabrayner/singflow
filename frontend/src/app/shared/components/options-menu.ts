import { Component, computed, input, viewChild } from '@angular/core';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { MenuPopover } from './menu-popover';

@Component({
  selector: 'app-options-menu',
  imports: [MenuModule, MenuPopover],
  template: `
    <app-menu-popover [buttonId]="buttonId()" [label]="label()" [disabled]="disabled()">
      <p-menu [model]="commands()" [ariaLabel]="label()" styleClass="sf-options-popup" />
    </app-menu-popover>
  `,
})
export class OptionsMenu {
  readonly buttonId = input.required<string>();
  readonly label = input.required<string>();
  readonly items = input.required<MenuItem[]>();
  readonly disabled = input(false);
  private readonly popover = viewChild.required(MenuPopover);
  readonly commands = computed(() =>
    this.items().map((item) => ({
      ...item,
      command: (event: Parameters<NonNullable<MenuItem['command']>>[0]) => {
        this.popover().close();
        item.command?.(event);
      },
    })),
  );
}
