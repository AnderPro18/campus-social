import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageViewerService } from '../../services/image-viewer.service';

@Component({
  selector: 'app-image-lightbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-lightbox.component.html',
  styleUrls: ['./image-lightbox.component.scss']
})
export class ImageLightboxComponent {
  readonly imageViewer = inject(ImageViewerService);

  @HostListener('document:keydown.escape')
  closeOnEscape() {
    this.imageViewer.close();
  }
}
