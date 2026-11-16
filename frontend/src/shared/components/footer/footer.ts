import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Site footer. */
@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  /** Year shown in the copyright notice. */
  protected readonly currentYear = new Date().getFullYear();
}
