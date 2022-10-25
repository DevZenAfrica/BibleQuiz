import {AfterViewInit, Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {AuthenticationService} from "../../../core/_services/authentication.service";
import {AbstractControl, FormBuilder, FormControl, FormGroup, Validators} from "@angular/forms";
import set = Reflect.set;
import {ImageCroppedEvent} from "ngx-image-cropper";
import {environment} from "../../../../environments/environment";
import {TranslateService} from "@ngx-translate/core";
import { MatSelect } from '@angular/material/select';
import { ReplaySubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {

  public countryFilterCtrl: FormControl = new FormControl();
  public filteredCountries: ReplaySubject<any[]> = new ReplaySubject<any[]>(1);

  //title: string = this._auth.api.current_lang.components.profile_player;
  current_user: any;
  object: any;
  imageChangedEvent: any = '';
  croppedImage: any = null;
  api_url: string = '';
  languages: Array<any> = [
    {key: 'fr', label: 'base.fr'},
    {key: 'en', label: 'base.en'}
  ];
  // Nestla nido riche en proteine 300 g

  profileForm = this.fb.group({
    //full_name: ['', [Validators.required, Validators.minLength(4)]],
    //player_name: ['', [Validators.required, Validators.minLength(4)]],
    full_name: ['', [Validators.minLength(4)]],
    player_name: ['', [Validators.minLength(4)]],
    lang: [this._auth.currentUserValue.lang, [Validators.required]],
    city_id: [null],
    other_city: [null],
    neighborhood: [null],
    avatar: [null],
    is_whatsapp: [false],
    is_sound: [false]
  });

  get fullName() {
    return this.profileForm.get('full_name');
  }

  get playerName() {
    return this.profileForm.get('player_name');
  }

  get city() {
    return this.profileForm.get('city_id');
  }

  get avatar() {
    return this.profileForm.get('avatar');
  }
  protected _onDestroy = new Subject<void>();

  constructor(private _auth: AuthenticationService,private fb: FormBuilder) {
  }

  ngOnInit(): void {
    this.current_user = this._auth.currentUserValue;
    this.setCityValidators();
    this.load_data();

    /*if (!environment.production) {
      this.api_url = environment.api_url;
    }*/

    this.api_url = environment.api_url;

    this._auth.currentUserSubject.subscribe(() => {
      this.profileForm.get('lang').patchValue(this._auth.api.current_lang_key);
    });

    this.countryFilterCtrl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.filterCountries();
      });
  }

  protected filterCountries() {
    if (!this.object.countries) {
      return;
    }
    // get the search keyword
    let search = this.countryFilterCtrl.value;
    if (!search) {
      this.filteredCountries.next(this.object.countries.slice());
      return;
    } else {
      search = search.toLowerCase();
    }
    // filter the banks
    this.filteredCountries.next(
      this.object.countries.filter(country => country.name.toLowerCase().indexOf(search) > -1)
    );
  }

  setCityValidators() {
    const other_city = this.profileForm.get('other_city');

    this.profileForm.get('city_id').valueChanges
      .subscribe(city_id => {
        if (city_id == 11) {
          other_city.setValidators([Validators.required]);
          setTimeout(() => {
            this._auth.api.active_input();
          });
        } else {
          other_city.clearValidators();
          other_city.patchValue(null);
        }

        other_city.updateValueAndValidity();
      });
  }

  load_data(load = true) {
    this._auth.api.is_loader(load);
    this._auth.api.request('data@get', 'profile')
      .subscribe(data => {
        this._auth.api.is_loader(false);
        this.object = data;
        this.object.user.avatar = null;
        //this.object.user.city_id = '' + this.object.user.city_id;
        console.log(data);

        this.filteredCountries.next(this.object.countries.slice());
        this.profileForm.patchValue(this.object.user);
        setTimeout(() => {
          this._auth.api.active_input();
          this._auth.api.active_tabs();
        });
      }, error => {
        this._auth.api.is_loader(false);
      })
  }

  save_profile(form: FormGroup = this.profileForm) {
    const log = form.value;
    this._auth.api.is_loader(true);
    if (form.valid) {
      this._auth.profile(log, true)
        .subscribe((data) => {
          this._auth.api.toast.success(data.message);
          this._auth.api.is_loader(false);
          this.load_data(false);
        }, err => {
          this._auth.api.is_loader(false);

          if (err.error.message)
            this._auth.api.toast.error(err.error.message);
          console.log(err);
        });
    }
  }

  /*change_phone(form: FormGroup = this.phoneForm) {
    const log = form.value;
    this._auth.api.is_loader(true);
    if (form.valid) {
      /!*this._auth.api.request('auth@post', 'update_phone', log)
        .subscribe((data) => {
          this._auth.api.toast.success(data.message);
          this._auth.api.is_loader(false);
          this.load_data(false);
        }, err => {
          this._auth.api.is_loader(false);

          if (err.error.message)
            this._auth.api.toast.error(err.error.message);
          console.log(err);
        });*!/
      this._auth.api.toast.info("Changement du numero de téléphone en construction");
    }
  }

  cancel_change() {

  }*/

  fileChangeEvent(event: any): void {
    this.imageChangedEvent = event;
    this._auth.api.is_loader(true);
  }

  imageCropped(event: ImageCroppedEvent) {
    this.croppedImage = event.base64;
    this.avatar.patchValue(this.croppedImage);
  }

  imageLoaded() {
    this._auth.api.is_loader(false);
    this.scrollToBottom();
  }

  scrollToBottom() {
    setTimeout(() => {
      window.scrollTo(0, document.body.scrollHeight);
    }, 230);
  }
}
