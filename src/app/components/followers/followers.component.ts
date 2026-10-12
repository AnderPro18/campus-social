import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FollowedUser, UserService } from '../../services/user.service';

@Component({
  selector: 'app-followers',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './followers.component.html',
  styleUrls: ['./followers.component.scss']
})
export class FollowersComponent implements OnInit {
  @Input({ required: true }) userId!: string;
  @Input({ required: true }) listType!: 'followers' | 'following';
  @Output() close = new EventEmitter<void>();

  private userService = inject(UserService);

  users: FollowedUser[] = [];
  loading = true;
  loadError = false;

  ngOnInit() {
    void this.loadUsers();
  }

  async loadUsers() {
    this.loading = true;
    this.loadError = false;

    try {
      this.users = this.listType === 'followers'
        ? await this.userService.getFollowers(this.userId)
        : await this.userService.getFollowing(this.userId);
    } catch (error) {
      console.error('Error cargando la lista de seguidores:', error);
      this.loadError = true;
    } finally {
      this.loading = false;
    }
  }
}
