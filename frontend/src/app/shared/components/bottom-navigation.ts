import {
  Component,
  input,
  output,
  afterNextRender,
  viewChild,
  ElementRef,
  inject,
  DestroyRef,
} from '@angular/core';
import { TabsModule } from 'primeng/tabs';
export interface BottomNavigationItem {
  value: string;
  label: string;
  icon: string;
}
@Component({
  selector: 'app-bottom-navigation',
  imports: [TabsModule],
  template: ` <nav #bar class="sf-bottom-navigation" [attr.aria-label]="label()">
    <p-tabs [value]="value()" (valueChange)="select($event)" class="sf-bottom-tabs">
      <p-tablist>
        @for (item of items(); track item.value) {
          <p-tab [value]="item.value" [disabled]="disabled()"
            ><i [class]="'pi ' + item.icon" aria-hidden="true"></i
            ><span>{{ item.label }}</span></p-tab
          >
        }
      </p-tablist>
    </p-tabs>
  </nav>`,
})
export class BottomNavigation {
  readonly heightChange = output<number>();
  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');
  private readonly destroyRef = inject(DestroyRef);
  constructor() {
    afterNextRender(() => {
      const bar = this.bar()?.nativeElement;
      if (!bar) return;
      const update = () => this.heightChange.emit(Math.ceil(bar.getBoundingClientRect().height));
      const observer = new ResizeObserver(update);
      observer.observe(bar);
      update();
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
  readonly label = input('Navegação do painel');
  readonly value = input.required<string>();
  readonly items = input.required<BottomNavigationItem[]>();
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  select(value: string | number | undefined) {
    if (typeof value === 'string' && !this.disabled()) this.valueChange.emit(value);
  }
}
