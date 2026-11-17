import { Component, input } from '@angular/core';
import { StreamingLink, streamingIcon, streamingUrl } from '../streaming';
@Component({
  selector: 'app-streaming-actions',
  styles: ':host{display:contents}',
  template: `@for (link of links(); track link.type) {
    @if (url(link); as href) {
      <a
        class="sf-icon-button"
        [href]="href"
        target="_blank"
        rel="noopener noreferrer"
        [attr.aria-label]="'Abrir ' + title() + ' no ' + link.label"
        [title]="'Abrir no ' + link.label"
      >
        <i [class]="icon(link)" aria-hidden="true"></i
        ><i class="fa-solid fa-up-right-from-square sf-external-mark" aria-hidden="true"></i>
      </a>
    }
  }`,
})
export class StreamingActions {
  readonly links = input<StreamingLink[]>([]);
  readonly title = input.required<string>();
  readonly icon = streamingIcon;
  url(link: StreamingLink) {
    return streamingUrl(link.type, link.url);
  }
}
