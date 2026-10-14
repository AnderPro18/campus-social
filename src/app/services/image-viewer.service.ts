import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ImageViewerService {
  readonly imageUrl = signal<string | null>(null);
  readonly imageAlt = signal('');

  open(imageUrl: string, imageAlt: string) {
    this.imageAlt.set(imageAlt);
    this.imageUrl.set(imageUrl);
  }

  close() {
    this.imageUrl.set(null);
  }
}
