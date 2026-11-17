import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

/** Shared URL field: clear the draft or open its validated external destination. */
@Component({
  selector: 'app-reference-link-input',
  imports: [ReactiveFormsModule, InputTextModule],
  styles: `
    :host {
      display: block;
    }
    .reference-link-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .reference-link-field {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    .reference-link-field input {
      width: 100%;
      padding-right: 44px;
    }
    .reference-link-clear {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      border: 0;
      background: transparent;
      color: var(--sf-muted);
      width: 44px;
      cursor: pointer;
    }
    .reference-link-row > a {
      flex: none;
    }
  `,
  template: `<label [for]="fieldId()">{{ label() }}</label>
    <div class="reference-link-row">
      <div class="reference-link-field">
        <input
          pInputText
          type="url"
          [id]="fieldId()"
          [formControl]="control()"
          maxlength="2048"
          [readOnly]="busy()"
        />
        @if (control().value) {
          <button
            type="button"
            class="reference-link-clear"
            [disabled]="busy()"
            [attr.aria-label]="'Limpar ' + label().toLowerCase()"
            (click)="clear()"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        }
      </div>
      @if (href()) {
        <a
          class="sf-icon-button"
          [href]="href()"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="'Abrir ' + label().toLowerCase()"
          ><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i
        ></a>
      }
    </div>`,
})
export class ReferenceLinkInput {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly control = input.required<FormControl<string>>();
  readonly href = input<string | null>(null);
  readonly busy = input(false);
  clear() {
    this.control().setValue('');
    this.control().markAsDirty();
  }
}
