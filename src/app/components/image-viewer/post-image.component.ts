import { Component, Input, inject } from '@angular/core';
import { ImageViewerService } from '../../services/image-viewer.service';

@Component({
  selector: 'app-post-image',
  standalone: true,
  templateUrl: './post-image.component.html',
  styleUrls: ['./post-image.component.scss']
})
export class PostImageComponent {
  @Input({ required: true }) src = '';
  @Input() alt = 'Ver imagen en grande';

  private imageViewer = inject(ImageViewerService);

  openImage() {
    if (this.src) {
      this.imageViewer.open(this.src, this.alt);
    }
  }
}
