import { Component } from '@angular/core';

/** Approved SingFlow identity; the surrounding link supplies its accessible name. */
@Component({
  selector: 'app-brand-logo',
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }
    img {
      display: block;
      width: 144px;
      height: 48px;
      object-fit: contain;
    }
  `,
  template: `<img
    src="brand/singflow-logo-144.webp"
    srcset="
      brand/singflow-logo-144.webp 1x,
      brand/singflow-logo-288.webp 2x,
      brand/singflow-logo-432.webp 3x
    "
    alt=""
    width="144"
    height="48"
    decoding="async"
  />`,
})
export class BrandLogo {}
