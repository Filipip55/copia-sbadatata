import { Component, signal, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Bottom navigation bar for mobile; hides while scrolling down. */
@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-bottom-navigation',
  styleUrl: './bottom-navigation.scss',
  templateUrl: './bottom-navigation.html',
})
export class BottomNavigation {
  /** Whether the bar is currently hidden. */
  isHidden = signal(false);
  private lastScrollY: number = 0;

  /** Hides the bar when scrolling down and shows it when scrolling up (5px threshold). */
  @HostListener('window:scroll')
  onWindowScroll() {
    const currentScrollY = window.scrollY;
    const difference = currentScrollY - this.lastScrollY;

    if (difference > 5) {
      this.isHidden.set(true);
    } else if (difference < -5) {
      this.isHidden.set(false);
    }

    this.lastScrollY = window.scrollY;
  }
}
