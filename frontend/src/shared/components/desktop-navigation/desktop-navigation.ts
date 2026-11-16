import { Component, signal, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Navigation links shown in the header on desktop. */
@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-desktop-navigation',
  styleUrl: './desktop-navigation.scss',
  templateUrl: './desktop-navigation.html',
})
export class DesktopNavigation {}
