import { ModalWhatsAppComponent } from "./../../../core/_components/modal-whats-app/modal-whats-app.component";
import { environment } from "./../../../../environments/environment";
import {
  AfterContentChecked,
  AfterViewInit,
  Component,
  OnInit,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthenticationService } from "../../../core/_services/authentication.service";
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  Validators,
} from "@angular/forms";
import {
  SearchCountryField,
  TooltipLabel,
  CountryISO,
  PhoneNumberFormat,
} from "ngx-intl-tel-input";
import { ReCaptchaV3Service } from "ng-recaptcha";
import { Subscription } from "rxjs";
import firebase from "firebase/app";
import "firebase/auth";
import { MatDialog } from "@angular/material/dialog";

declare function getMsisdn(): any;
declare function getCountry(): any;
declare function getSelfJidFromUrl(jid: string): any;
declare function getURLParameter(string): any;
declare const globalUserName: any;
declare const avatarUser: any;

declare var $: any;

@Component({
  selector: "app-login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.scss"],
})
export class LoginComponent implements OnInit, AfterViewInit {

  isLoadingFromAyoba = false;

  printDebug='';
  printError = '';
  printId = '';

  private subscription: Subscription;
  title: string = "components.ask_connect_account";
  private returnUrl: string;
  is_register_form = false;
  is_login_form = false;
  is_forget_form = false;
  object_login: any = {};
  object_register: any = {};
  private phone: string;
  windowRef: any;
  verificationCode: string;

  separateDialCode = true;
  SearchCountryField = SearchCountryField;
  TooltipLabel = TooltipLabel;
  CountryISO = CountryISO;
  PhoneNumberFormat = PhoneNumberFormat;
  preferredCountries: CountryISO[] = [
    CountryISO.Cameroon,
    CountryISO.France,
    CountryISO.Mali,
    CountryISO.Niger,
    CountryISO.CôteDIvoire,
    CountryISO.Senegal,
    CountryISO.Gabon,
  ];

  type_login: string = "list_view";

  phoneForm = this.fb.group({
    phone_number: [undefined, [Validators.required]],
    code: ["", [Validators.required]],
  });
  get phoneNumberP() {
    return this.phoneForm.get("phone_number");
  }

  registerForm = this.fb.group({
    email: ["", [Validators.required, Validators.email]],
    phone_number: [undefined],
    player_name: ["", [Validators.required, Validators.minLength(4)]],
    full_name: ["", [Validators.required, Validators.minLength(4)]],
    is_whatsapp: [false],
  });

  get phoneNumberR() {
    return this.registerForm.get("phone_number");
  }

  get emailR() {
    return this.registerForm.get("email");
  }

  get playerName() {
    return this.registerForm.get("player_name");
  }

  get fullName() {
    return this.registerForm.get("full_name");
  }

  loginForm = this.fb.group({
    email: ["", [Validators.required, Validators.email]],
    code: ["", [Validators.required, Validators.minLength(4)]],
  });

  get phoneNumberL() {
    return this.loginForm.get("phone_number");
  }

  get code() {
    return this.loginForm.get("code");
  }

  number_change(phone: AbstractControl, length: number = 9) {
    if (phone.value) {
      const val = phone.value.toString();
      if (val.length > length) {
        phone.patchValue(+val.slice(0, -1));
      }
    }
  }

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private recaptchaV3Service: ReCaptchaV3Service,
    public _auth: AuthenticationService,
    public dialog: MatDialog
  ) {}

  ngOnInit(): void {
    if (getMsisdn()) {
      this.isLoadingFromAyoba = true;
      /*this.printId = globalUserName;
      this.printDebug = ' -a- ' + getMsisdn().toString();
      this.printError = ' -b- ' + getSelfJidFromUrl("jid").toString();*/

      this._auth
        .login({
          uid: getMsisdn().toString().replace('+',''),
          displayName: globalUserName,
          photoURL: null,
          email: null,
          phoneNumber: getMsisdn().toString(),
          providerId: "phone",
          ref_parent: localStorage.getItem("key_parain_code")
        })
        .subscribe(
          (data) => {
            if (data.message) {
              this._auth.api.toast.success(data.message);
            }
            this.returnUrl = '/nouveau-jeu';
            this.router.navigate([this.returnUrl]).then(
              () => {
                this._auth.api.is_loader(false);
              },
              () => {
                this._auth.api.is_loader(false);
              }
            );
            this.loginForm.reset();
            this.__init();
            //this.windowRef.confirmationResult = null;
          },
          (err) => { this.printError = err;
            this._auth.api.is_loader(false);

            if (err.error.ask_resend_link && err.error.message) {
              this._auth.api.toast.info(err.error.message);
              this.object_login.ask_resend_link = true;
            } else if (err.error.message) {
              this._auth.api.toast.error(err.error.message);
            }
            console.log(err);
          }
        );
    } else {
      this.windowRef = this._auth.windowRef;
      this.windowRef.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
        "recaptcha-container",
        {
          size: "invisible",
        }
      );

      this.windowRef.recaptchaVerifier.render();

      this.returnUrl = this.route.snapshot.queryParams["returnUrl"] || "/accueil";
    }
  }

  openDialog() {
    this.dialog.open(ModalWhatsAppComponent, {
      width: "90%",
      minWidth: "90%",
      panelClass: "dialog-wha",
      data: { key: "login_wha" },
    });
  }

  ngAfterViewInit(): void {
    this.__init();
    //this.openDialog();
  }

  __init() {
    this.object_login = {};
    this.object_register = {};
    this.phone = null;
    this.loginForm.reset();
    this.registerForm.reset();
    this.phoneForm.reset();
    this.windowRef.confirmationResult = null;

    setTimeout(() => {
      this._auth.api.active_input();
    }, 230);
  }

  login() {
    if (environment.production) {
      this.subscription = this.recaptchaV3Service.execute("login").subscribe(
        (token) => {
          console.log(token);
          this.loginForm.get("recaptcha").patchValue(token);
          this.handle_login();
        },
        (error) => {
          this._auth.api.toast.error(error);
        }
      );
    } else {
      console.log(this.loginForm.value);

      //this.handle_login();
    }
  }

  handle_login() {
    const country = this._auth.api.list_country.find(
      (it) => it.alpha2 === this.phoneNumberL.value.countryCode.toLowerCase()
    );
    console.log(country);
    if (country) {
      const log = this.loginForm.value;

      if (this.loginForm.valid) {
        this._auth.api.is_loader(true);
        this.object_register.ask_resend_link = false;
        this._auth
          .login({
            phone: log.phone_number.e164Number,
            code: log.code,
            recaptcha: log.recaptcha,
            countryCode: log.phone_number.countryCode.toLowerCase(),
            dialCode: log.phone_number.dialCode,
            ref_parent: localStorage.getItem("key_parain_code")
          })
          .subscribe(
            (data) => {
              if (data.message) {
                this._auth.api.toast.success(data.message);
              }
              this.router.navigate([this.returnUrl]).then(
                () => {
                  this._auth.api.is_loader(false);
                },
                () => {
                  this._auth.api.is_loader(false);
                }
              );
              this.loginForm.reset();
              this.__init();
            },
            (err) => {
              this._auth.api.is_loader(false);

              if (err.error.ask_resend_link && err.error.message) {
                this._auth.api.toast.info(err.error.message);
                this.object_login.ask_resend_link = true;
                this.phone = log.phone_number;
              } else if (err.error.message) {
                this._auth.api.toast.error(err.error.message);
              }
              console.log(err);
            }
          );
      } else if (this._auth.api.current_lang) {
        if (this._auth.api.current_lang.components) {
          this._auth.api.toast.info(
            this._auth.api.current_lang.components.check_required_message
          );
        }
      }
    } else {
      if (
        this._auth.api.current_lang &&
        this._auth.api.current_lang.components
      ) {
        this._auth.api.toast.info(
          this._auth.api.current_lang.components.country_not_exist
        );
      }
    }
  }

  doFacebookLogin() {
    this._auth.api.is_loader(true);
    this._auth.doFacebookLogin().then(
      (user) => {
        this.object_register.ask_resend_link = false;
        this._auth
          .login({
            ...user.providerData[0],
            uid: user.uid,
            ref_parent: localStorage.getItem("key_parain_code")
          })
          .subscribe(
            (data) => {
              if (data.message) {
                this._auth.api.toast.success(data.message);
              }
              this.router.navigate([this.returnUrl]).then(
                () => {
                  this._auth.api.is_loader(false);
                },
                () => {
                  this._auth.api.is_loader(false);
                }
              );
              this.loginForm.reset();
              this.__init();
            },
            (err) => {
              this._auth.api.is_loader(false);

              if (err.error.ask_resend_link && err.error.message) {
                this._auth.api.toast.info(err.error.message);
                this.object_login.ask_resend_link = true;
              } else if (err.error.message) {
                this._auth.api.toast.error(err.error.message);
              }
              console.log(err);
            }
          );
      },
      (err) => {
        this._auth.api.is_loader(false);
        if (err.code == "auth/account-exists-with-different-credential")
          this._auth.api.toast.info(
            this._auth.api.current_lang.components.connect_google_account
          );
      }
    );
  }

  doGoogleLogin() {
    this._auth.api.is_loader(true);
    this._auth.doGoogleLogin().then(
      (user) => {
        this.object_register.ask_resend_link = false;
        this._auth
          .login({
            ...user.providerData[0],
            uid: user.uid,
            ref_parent: localStorage.getItem("key_parain_code"),
          })
          .subscribe(
            (data) => {
              if (data.message) {
                this._auth.api.toast.success(data.message);
              }
              this.router.navigate([this.returnUrl]).then(
                () => {
                  this._auth.api.is_loader(false);
                },
                () => {
                  this._auth.api.is_loader(false);
                }
              );
              this.loginForm.reset();
              this.__init();
            },
            (err) => {
              this._auth.api.is_loader(false);

              if (err.error.ask_resend_link && err.error.message) {
                this._auth.api.toast.info(err.error.message);
                this.object_login.ask_resend_link = true;
              } else if (err.error.message) {
                this._auth.api.toast.error(err.error.message);
              }
            }
          );
      },
      (err) => {
        this._auth.api.is_loader(false);
        if (err.code == "auth/account-exists-with-different-credential")
          this._auth.api.toast.info(
            this._auth.api.current_lang.components.connect_facebook_account
          );
      }
    );
  }

  sendLoginCode() {
    if (this.phoneNumberP.valid) {
      this._auth.api.is_loader(true);
      const appVerifier = this.windowRef.recaptchaVerifier;
      const num = this.phoneNumberP.value.e164Number;
      console.log(this.phoneForm.value);

      this._auth.afAuth.signInWithPhoneNumber(num, appVerifier).then(
        (result) => {
          this._auth.api.is_loader(false);
          this.windowRef.confirmationResult = result;
        },
        (error) => {
          this._auth.api.is_loader(false);
          this._auth.api.toast.error(
            this._auth.api.current_lang.components.fail_send_login_code_sms
          );
        }
      );
    } else {
      this._auth.api.toast.info(
        this._auth.api.current_lang.components.phone_not_valid
      );
    }
  }

  verifyLoginCode() {
    this._auth.api.is_loader(true);
    console.log(this.phoneForm.value);
    this.windowRef.confirmationResult
      .confirm(this.phoneForm.value.code)
      .then(
        (result) => {
          const user = result.user;
          this.object_register.ask_resend_link = false;
          this._auth
            .login({
              ...user.providerData[0],
              uid: user.uid,
              ref_parent: localStorage.getItem("key_parain_code"),
            })
            .subscribe(
              (data) => {
                if (data.message) {
                  this._auth.api.toast.success(data.message);
                }
                this.router.navigate([this.returnUrl]).then(
                  () => {
                    this._auth.api.is_loader(false);
                  },
                  () => {
                    this._auth.api.is_loader(false);
                  }
                );
                this.loginForm.reset();
                this.__init();
                this.windowRef.confirmationResult = null;
              },
              (err) => {
                this._auth.api.is_loader(false);

                if (err.error.ask_resend_link && err.error.message) {
                  this._auth.api.toast.info(err.error.message);
                  this.object_login.ask_resend_link = true;
                } else if (err.error.message) {
                  this._auth.api.toast.error(err.error.message);
                }
                console.log(err);
              }
            );
        },
        (error) => {
          this._auth.api.is_loader(false);
          console.log(error, "Incorrect code entered?");
        }
      )
      .catch((error) => {
        this._auth.api.is_loader(false);
        console.log(error, "Incorrect code entered?");
      });
  }

  goto_provider() {
    this.type_login = "list_view";
    this.__init();
  }

  open_form(type) {
    switch (type) {
      case "phone":
        this.type_login = "phone";
        break;

      default:
        break;
    }
  }

  close_menu($event: MouseEvent) {
    $event.stopPropagation();
    $event.preventDefault();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
