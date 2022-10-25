import { ModalWhatsAppComponent } from "./../../core/_components/modal-whats-app/modal-whats-app.component";
import { Component, OnInit } from "@angular/core";
import { environment } from "../../../environments/environment";
import { AuthenticationService } from "../../core/_services/authentication.service";
import { Router } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";

declare var $: any;

@Component({
  selector: "app-home",
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.scss"],
})
export class HomeComponent implements OnInit {
  description: string = "views.home_title";
  sliderOptions = {
    margin: 15,
    items: 1,
    dots: false,
    //navigation: true,
    nav: false,
    autoplay: true,
    loop: true,
    autoplayTimeout: 7000,
    //autoplayHoverPause: true,
    //lazyLoad: true,
    width: 320,
    responsive: {
      0: {
        items: 1,
      },
      400: {
        items: 1,
      },
      740: {
        items: 2,
      },
      940: {
        items: 3,
      },
    },
  };
  sliderOptions2 = {
    margin: 15,
    items: 1,
    dots: false,
    //navigation: true,
    nav: false,
    autoplay: true,
    loop: true,
    autoplayTimeout: 6000,
    //autoplayHoverPause: true,
    //lazyLoad: true,
    width: 320,
    responsive: {
      0: {
        items: 1,
      },
      400: {
        items: 1,
      },
      740: {
        items: 2,
      },
      940: {
        items: 3,
      },
    },
  };

  list: Array<any> = [];
  list_top_5: Array<any> = [];
  my_stat_data: any;
  is_load: boolean = false;
  current_user: any;
  api_url: string = "";
  private current_lang = null;
  date: any = {};

  constructor(private _auth: AuthenticationService, public dialog: MatDialog) {}

  openDialog() {
    this.dialog.open(ModalWhatsAppComponent, {
      width: "90%",
      minWidth: "90%",
      panelClass: "dialog-wha",
      data: { key: "home" },
    });
  }

  ngOnInit(): void {
    this.current_user = this._auth.currentUserValue;
    this.current_lang = this._auth.api.current_lang_key;

    this.date = this._auth.api.current_week();

    /*if (!environment.production) {
      this.api_url = environment.api_url;
    }*/

    this.api_url = environment.api_url;

    if (this.current_user) {
      this.my_stat();
    } else {
      this.load_top_5();
    }

    this._auth.currentUserSubject.subscribe(() => {
      if (this.current_lang != this._auth.api.current_lang_key)
        this.load_data();
    });
  }

  open_url(obj, $event: MouseEvent) {
    $event.stopPropagation();
    $event.preventDefault();
    /*this.router.navigateByUrl(obj.link).then(() => {
      if (obj.is_reload) {
        location.reload();
      }
    });*/
  }

  load_data() {
    this._auth.api.is_loader(true);
    this.is_load = false;
    this._auth.api.request("data@get", "content_slider").subscribe(
      (data) => {
        this._auth.api.is_loader(false);
        this.list = data;
        setTimeout(() => {
          this.is_load = true;
        });
      },
      (error) => {
        this._auth.api.is_loader(false);
        this._auth.api.toast.error(
          this._auth.api.current_lang.base.reload_page
        );
      }
    );
  }

  load_top_5() {
    this._auth.api.is_loader(true);
    this.is_load = false;
    this._auth.api.request("data@get", "top_5_stat").subscribe(
      (data) => {
        this._auth.api.is_loader(false);
        this.list_top_5 = data;
        this.load_data();
        //if (!localStorage.getItem("own_user_access")) this.openDialog();
      },
      (error) => {
        this._auth.api.is_loader(false);
        this._auth.api.toast.error(
          this._auth.api.current_lang.base.reload_page
        );
      }
    );
  }

  my_stat() {
    this._auth.api.is_loader(true);
    this.is_load = false;
    this._auth.api.request("data@get", "my_stat").subscribe(
      (data) => {
        this._auth.api.is_loader(false);
        this.my_stat_data = data;
        this.load_data();
        //if (!localStorage.getItem("own_user_access")) this.openDialog();
      },
      (error) => {
        this._auth.api.is_loader(false);
        this._auth.api.toast.error(
          this._auth.api.current_lang.base.reload_page
        );
      }
    );
  }
}
