import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'maroti-maharaj-temple';

  constructor(private translate: TranslateService) {
    // Add supported languages
    this.translate.addLangs(['en', 'mr', 'hi']);
    // Set default language
    this.translate.setDefaultLang('en');

    // Check localStorage for saved language preference
    const savedLang = localStorage.getItem('lang');
    if (savedLang && ['en', 'mr', 'hi'].includes(savedLang)) {
      this.translate.use(savedLang);
    } else {
      // First visit: show the site in Marathi (visitors can switch from the navbar)
      this.translate.use('mr');
    }

    // Save language to localStorage whenever it changes
    this.translate.onLangChange.subscribe(event => {
      localStorage.setItem('lang', event.lang);
    });
  }
}
