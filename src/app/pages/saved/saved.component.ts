import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SavedService } from '../../services/saved.service';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-saved',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './saved.component.html',
  styleUrls: ['./saved.component.scss']
})
export class SavedComponent {
  private savedService = inject(SavedService);
  private auth = inject(AuthService);

  savedItems: any[] = [];
  toastMessage: string | null = null;

  // ── Modal ──────────────────────────────────────────────────────
  selectedPost: any = null;

  openPost(post: any) {
    this.selectedPost = post;
  }

  closePost() {
    this.selectedPost = null;
  }

  // ── Toast ──────────────────────────────────────────────────────
  showToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => this.toastMessage = null, 2500);
  }

  // ── Cargar guardados ───────────────────────────────────────────
  async ngOnInit() {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return;

    this.savedService.getSavedPosts(user.uid).subscribe(async savedPromise => {
      this.savedItems = await savedPromise;
    });
  }

  // ── Eliminar guardado ──────────────────────────────────────────
  async remove(postId: string, event: MouseEvent) {
    event.stopPropagation(); // evita abrir el modal al borrar
    await this.savedService.removeSave(postId);
    this.savedItems = this.savedItems.filter(item => item.id !== postId);
    if (this.selectedPost?.id === postId) this.closePost();
    this.showToast('Publicación eliminada de guardados');
  }
}