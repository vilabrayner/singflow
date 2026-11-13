import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { PanelHeader } from '../../shared/components/panel-header';
import { SurfaceCard } from '../../shared/components/surface-card';
import { ApiClient, apiError } from '../../core/http/api-client';

type RegistrationField = 'name' | 'email' | 'password' | 'confirmation';

@Component({
  selector: 'app-registration-page',
  styles: `
    :host {
      display: block;
      background: var(--sf-canvas);
    }
    .sf-password-field input {
      width: 100%;
    }
    .sf-host-shell input.p-invalid {
      border-color: var(--p-inputtext-invalid-border-color, #dc2626);
    }
    .sf-host-shell input.p-invalid:focus-visible {
      outline-color: var(--p-inputtext-invalid-border-color, #dc2626);
    }
    .registration-field-error {
      display: block;
      margin: -8px 0 12px;
    }
    .registration-form-error {
      display: block;
      margin: 4px 0 8px;
    }

    .sf-host-shell .registration-field-help {
      margin: -4px 0 12px;
      font-size: 13px;
    }
  `,
  imports: [
    PanelHeader,
    SurfaceCard,
    RouterLink,
    ReactiveFormsModule,
    InputTextModule,
    MessageModule,
  ],
  template: ` <app-panel-header />
    <main class="sf-host-shell">
      <div class="sf-centered-state">
        <app-surface-card labelledBy="registration-title">
          <span class="sf-card-icon" aria-hidden="true">
            <i
              [class]="
                sent()
                  ? 'fa-solid fa-envelope'
                  : role === 'HOST'
                    ? 'fa-solid fa-bullhorn'
                    : 'fa-solid fa-guitar'
              "
            ></i>
          </span>
          <h1 id="registration-title">
            {{
              sent()
                ? 'Confira seu e-mail'
                : 'Criar conta de ' + (role === 'HOST' ? 'anfitrião' : 'músico')
            }}
          </h1>
          @if (sent()) {
            <p role="status">
              Enviamos um link de confirmação para <strong>{{ form.controls.email.value }}</strong
              >. Ele vale por 24 horas. Confira também a pasta de spam.
            </p>
            <p>Depois de confirmar o e-mail, seu cadastro precisa da aprovação do administrador.</p>
            @if (error()) {
              <p-message
                severity="error"
                icon="fa-solid fa-circle-exclamation"
                class="registration-form-error"
                >{{ error() }}</p-message
              >
            }
            @if (message()) {
              <p-message severity="info" class="registration-form-error">{{ message() }}</p-message>
            }
            <div class="sf-dialog-actions">
              <a
                class="sf-button sf-primary sf-full"
                [routerLink]="role === 'HOST' ? '/anfitriao' : '/musico'"
                >Ir para o login</a
              >
              <button
                type="button"
                class="sf-button sf-outline sf-full"
                [disabled]="busy()"
                (click)="resend()"
              >
                Reenviar confirmação
              </button>
            </div>
          } @else {
            <p>Confirme seu e-mail e aguarde a aprovação para usar o painel.</p>
            <form class="host-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <label for="registration-name">Nome</label>
              <input
                id="registration-name"
                pInputText
                formControlName="name"
                autocomplete="name"
                required
                maxlength="120"
                [readOnly]="busy()"
                [invalid]="!!fieldError('name')"
                [attr.aria-invalid]="!!fieldError('name')"
                [attr.aria-describedby]="fieldError('name') ? 'registration-name-error' : null"
                (input)="clearFieldError('name')"
              />
              @if (fieldError('name'); as detail) {
                <p-message
                  id="registration-name-error"
                  severity="error"
                  size="small"
                  variant="simple"
                  icon="fa-solid fa-circle-exclamation"
                  class="registration-field-error"
                  >{{ detail }}</p-message
                >
              }
              <label for="registration-email">E-mail</label>
              <input
                id="registration-email"
                pInputText
                formControlName="email"
                type="email"
                autocomplete="email"
                required
                maxlength="254"
                [readOnly]="busy()"
                [invalid]="!!fieldError('email')"
                [attr.aria-invalid]="!!fieldError('email')"
                [attr.aria-describedby]="fieldError('email') ? 'registration-email-error' : null"
                (input)="clearFieldError('email')"
              />
              @if (fieldError('email'); as detail) {
                <p-message
                  id="registration-email-error"
                  severity="error"
                  size="small"
                  variant="simple"
                  icon="fa-solid fa-circle-exclamation"
                  class="registration-field-error"
                  >{{ detail }}</p-message
                >
              }
              <label for="registration-password">Senha</label>
              <div class="sf-password-field">
                <input
                  id="registration-password"
                  pInputText
                  formControlName="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  autocomplete="new-password"
                  required
                  [readOnly]="busy()"
                  [invalid]="!!fieldError('password')"
                  [attr.aria-invalid]="!!fieldError('password')"
                  [attr.aria-describedby]="
                    fieldError('password') ? 'registration-password-error' : 'password-help'
                  "
                  (input)="clearFieldError('password')"
                />
                <button
                  type="button"
                  class="sf-icon-button"
                  [attr.aria-label]="showPassword() ? 'Ocultar senha' : 'Mostrar senha'"
                  [attr.aria-pressed]="showPassword()"
                  [disabled]="busy()"
                  (click)="showPassword.set(!showPassword())"
                >
                  <i
                    [class]="showPassword() ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                    aria-hidden="true"
                  ></i>
                </button>
              </div>
              @if (fieldError('password'); as detail) {
                <p-message
                  id="registration-password-error"
                  severity="error"
                  size="small"
                  variant="simple"
                  icon="fa-solid fa-circle-exclamation"
                  class="registration-field-error"
                  >{{ detail }}</p-message
                >
              } @else {
                <p id="password-help" class="registration-field-help">
                  Use pelo menos 12 caracteres.
                </p>
              }
              <label for="registration-confirmation">Confirmar senha</label>
              <div class="sf-password-field">
                <input
                  id="registration-confirmation"
                  pInputText
                  formControlName="confirmation"
                  [type]="showConfirmation() ? 'text' : 'password'"
                  autocomplete="new-password"
                  required
                  [readOnly]="busy()"
                  [invalid]="!!fieldError('confirmation')"
                  [attr.aria-invalid]="!!fieldError('confirmation')"
                  [attr.aria-describedby]="
                    fieldError('confirmation') ? 'registration-confirmation-error' : null
                  "
                  (input)="clearFieldError('confirmation')"
                />
                <button
                  type="button"
                  class="sf-icon-button"
                  [attr.aria-label]="
                    showConfirmation()
                      ? 'Ocultar confirmação de senha'
                      : 'Mostrar confirmação de senha'
                  "
                  [attr.aria-pressed]="showConfirmation()"
                  [disabled]="busy()"
                  (click)="showConfirmation.set(!showConfirmation())"
                >
                  <i
                    [class]="showConfirmation() ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                    aria-hidden="true"
                  ></i>
                </button>
              </div>
              @if (fieldError('confirmation'); as detail) {
                <p-message
                  id="registration-confirmation-error"
                  severity="error"
                  size="small"
                  variant="simple"
                  icon="fa-solid fa-circle-exclamation"
                  class="registration-field-error"
                  >{{ detail }}</p-message
                >
              }
              <button
                class="sf-button sf-primary sf-full"
                type="submit"
                [disabled]="form.invalid || busy()"
              >
                @if (busy()) {
                  <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                }
                {{ busy() ? 'Enviando…' : 'Criar minha conta' }}
              </button>
              @if (error()) {
                <p-message
                  severity="error"
                  icon="fa-solid fa-circle-exclamation"
                  class="registration-form-error"
                  >{{ error() }}</p-message
                >
              }
            </form>
            <a
              class="sf-button sf-text sf-full"
              [routerLink]="role === 'HOST' ? '/anfitriao' : '/musico'"
              >Já tenho conta</a
            >
          }
        </app-surface-card>
      </div>
    </main>`,
})
export class RegistrationPage {
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly role = inject(ActivatedRoute).snapshot.data['role'] as 'HOST' | 'MUSICIAN';
  readonly showPassword = signal(false);
  readonly showConfirmation = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly sent = signal(false);
  readonly message = signal('');
  private readonly submitted = signal(false);
  private readonly serverErrors = signal<Partial<Record<RegistrationField, string>>>({});
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(12),
        (control: AbstractControl) =>
          new TextEncoder().encode(control.value ?? '').length > 72 ? { byteLength: true } : null,
      ],
    ],
    confirmation: ['', Validators.required],
  });
  fieldError(field: RegistrationField): string {
    const server = this.serverErrors()[field];
    if (server) return server;
    const control = this.form.controls[field];
    if (!control.touched && !this.submitted()) return '';
    if (control.hasError('required') || control.hasError('pattern'))
      return {
        name: 'Informe seu nome.',
        email: 'Informe seu e-mail.',
        password: 'Informe uma senha.',
        confirmation: 'Confirme sua senha.',
      }[field];
    if (control.hasError('email')) return 'Informe um e-mail válido.';
    if (control.hasError('minlength')) return 'Use pelo menos 12 caracteres na senha.';
    if (control.hasError('maxlength'))
      return field === 'name'
        ? 'Use até 120 caracteres no nome.'
        : 'Use até 254 caracteres no e-mail.';
    if (control.hasError('byteLength'))
      return 'A senha está muito longa. Use uma senha menor, com pelo menos 12 caracteres.';
    if (field === 'confirmation' && control.value !== this.form.controls.password.value)
      return 'As senhas precisam ser iguais.';
    return '';
  }
  clearFieldError(field: RegistrationField) {
    this.serverErrors.update((errors) => {
      const next = { ...errors };
      delete next[field];
      return next;
    });
    this.error.set('');
  }
  private focusField(field: RegistrationField) {
    const input = this.document.getElementById('registration-' + field);
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: 'center' });
  }
  async submit() {
    if (this.busy()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const invalid = (['name', 'email', 'password', 'confirmation'] as const).find(
      (field) => !!this.fieldError(field),
    );
    if (invalid) {
      this.focusField(invalid);
      return;
    }
    const { name, email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post('/public/accounts/register', {
        name: name.trim(),
        email: email.trim(),
        password,
        role: this.role,
      });
      this.sent.set(true);
      this.showPassword.set(false);
      this.showConfirmation.set(false);
      this.form.controls.password.reset();
      this.form.controls.confirmation.reset();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.serverErrors.set({
          email: error.error?.detail ?? 'Já existe uma conta com este e-mail. Entre na sua conta.',
        });
        this.focusField('email');
      } else {
        this.error.set(
          error instanceof HttpErrorResponse && [400, 503].includes(error.status)
            ? (error.error?.detail ?? apiError(error))
            : apiError(error),
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
  async resend() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post('/public/accounts/resend', {
        email: this.form.controls.email.value.trim(),
      });
      this.message.set(
        'Se houver uma confirmação pendente, enviaremos o link. Aguarde um minuto entre os envios.',
      );
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
