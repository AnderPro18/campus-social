import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProfileStateService {

  private profileCompleteSubject = new BehaviorSubject<boolean>(false);

  profileComplete$ = this.profileCompleteSubject.asObservable();

  setProfileComplete(value: boolean) {
    this.profileCompleteSubject.next(value);
  }
}