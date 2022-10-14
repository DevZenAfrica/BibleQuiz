import {AfterViewInit, ChangeDetectionStrategy, Component, HostListener, OnInit} from '@angular/core';
import {
  ActivatedRoute,
  NavigationCancel,
  NavigationEnd,
  NavigationError, NavigationStart,
  RouteConfigLoadEnd,
  RouteConfigLoadStart, Router
} from "@angular/router";
import {ApiService} from "./core/_services/api.service";
import {filter, map, mergeMap} from "rxjs/operators";
import {environment} from "../environments/environment";
import {Title} from "@angular/platform-browser";
import {AuthenticationService} from "./core/_services/authentication.service";
import {TranslateService} from "@ngx-translate/core";

declare var $: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'Bible';

  showScroll: boolean;
  showScrollHeight = 300;
  hideScrollHeight = 10;
  is_login: boolean;

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    public _api: ApiService,
    private _auth: AuthenticationService,
    private translate: TranslateService,
    private titleService: Title) {

    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this._auth.api.is_loader(true);
      }
      if (event instanceof RouteConfigLoadStart) {
        this._auth.api.is_loader(true);
      }
      if (event instanceof RouteConfigLoadEnd) {
        this._auth.api.is_loader(true);
      }
      if (event instanceof NavigationEnd || event instanceof NavigationCancel) {
        this._auth.api.is_loader(false);
      }
      if (event instanceof NavigationError) {
        this._auth.api.is_loader(false);
      }
    });

    this.translate.addLangs(['en', 'fr']);
    this.translate.setDefaultLang('fr');

    const browserLang = this.translate.getBrowserLang();
    if (!this._api.current_lang_key) {
      this.translate.use(browserLang.match(/en|fr/) ? browserLang : 'fr')
        .subscribe(languages => {
          this._api.current_lang = languages;
          this._api.current_lang_key = this.translate.currentLang;
        });
    } else {
      this.translate.use(this._api.current_lang_key.match(/en|fr/) ? this._api.current_lang_key : (browserLang.match(/en|fr/) ? browserLang : 'fr'))
        .subscribe(languages => {
          this._api.current_lang = languages;
        });
    }
  }

  ngOnInit(): void {
    this._auth.currentUserSubject.subscribe(data => {
      this.is_login = !!data;
    });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        map(() => this.activatedRoute),
        map((route) => {
          while (route.firstChild) {
            route = route.firstChild;
          }
          return route;
        }),
        filter((route) => route.outlet === 'primary'),
        mergeMap((route) => route.data)
      )
      .subscribe((event) => {
        if (event['title']) {
          this.title = `${event['title']}`;
          this.scrollToTop();
          this.titleService.setTitle(`${this.title} | ${environment.app_name}`);
        }
      });
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if ((window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop) > this.showScrollHeight) {
      this.showScroll = true;
    } else if (this.showScroll && (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop) < this.hideScrollHeight) {
      this.showScroll = false;
    }
  }

  scrollToTop() {
    (function smoothscroll() {
      var currentScroll = document.documentElement.scrollTop || document.body.scrollTop;
      if (currentScroll > 0) {
        window.requestAnimationFrame(smoothscroll);
        window.scrollTo(0, currentScroll - (currentScroll / 5));
      }
    })();
  }

  launch_mod() {
    window.alert("The English version of " + environment.app_name + " Application will be available soon!");
  }

  close_menu($event: MouseEvent) {
    $event.stopPropagation();
    $event.preventDefault();
    let menuClose = $('.menu-close, .menu-hider, .close-menu');

    setTimeout(() => {
      menuClose.trigger('click');
    }, 230);
  }

  logout($event: MouseEvent) {
    this._auth.logout().subscribe(data => {
      this.close_menu($event);
      this.router.navigate(['/accueil']);
    })
  }

  change_language() {
    const lang = this._api.current_lang_key == 'en' ? 'fr' : 'en';
    this._auth.change_language(lang, true);
  }
}
