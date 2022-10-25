import {AfterViewInit, Component, OnInit} from '@angular/core';
import {AuthenticationService} from "../../core/_services/authentication.service";
import {NgxSpinnerService} from "ngx-spinner";
import {environment} from "../../../environments/environment";

@Component({
    selector: 'app-rank',
    templateUrl: './rank.component.html',
    styleUrls: ['./rank.component.scss']
})
export class RankComponent implements OnInit {

    title: string = "menu.rank_top_30";
    object_7: any;
    object_30: any;
    current_user: any;
    notScrolly7 = true;
    notScrolly30 = true;
    api_url: string = '';
    date: any = {};
    total_tab: number = null;

    constructor(private _auth: AuthenticationService, private spinner: NgxSpinnerService) {

    }

    ngOnInit(): void {
        /*if (!environment.production) {
            this.api_url = environment.api_url;
        }*/

        this.api_url = environment.api_url;

        this.current_user = this._auth.currentUserValue;

        this._auth.api.loadAppConfig().then((data: any) => {
            console.log(data);
            this.total_tab = data.total_week;
            this.init_data_7();

            setTimeout(() => {
                this._auth.api.active_tabs();
            }, 230);
        });
    }

    private get_week(week = 0) {
        this.date = this._auth.api.current_week(week);
    }

    init_data_7(week = 0) {
        this.object_7 = [];
        this.get_week(week);
        this._auth.api.is_loader(true);
        this._auth.api.request('data@get', 'top_7_stat', {week})
            .subscribe((data: any) => {
                this.object_7 = data;
                this._auth.api.is_loader(false);
            }, error => {
                this._auth.api.is_loader(false);
            })
    }

    onScroll7() {
        console.log('ici scroll');
        if (this.object_7 && this.notScrolly7) {
            const index = this.object_7.current_page + 1;
            if (index <= this.object_7.last_page) {
                console.log(index, this.object_7.current_page, this.object_7.last_page);
                console.log("Chargement des prochains articles");
                this.notScrolly7 = false;
                this.init_data_7(index)
            }
        }
    }

    init_data_30(page = 1) {
        if (page > 1 || !(this.object_30 && this.object_30.data.length > 0)) {
            this.spinner.show('d30');
            this._auth.api.is_loader(true);
            this._auth.api.request('data@get', 'top_30_stat', {page})
                .subscribe((data: any) => {
                    if (this.object_30) {
                        const last_list = this.object_30.data;
                        this.object_30 = {...data};
                        this.object_30.data = [...last_list, ...data.data];
                    } else
                        this.object_30 = data;
                    this.notScrolly30 = true;
                    this.spinner.hide('d30');
                    this._auth.api.is_loader(false);
                }, error => {
                    console.error(error);
                    this.spinner.hide('d30');
                    this.notScrolly30 = true;
                    this._auth.api.is_loader(false);
                })
        }
    }

    onScroll30() {
        console.log('ici scroll');
        if (this.object_30 && this.notScrolly30) {
            const index = this.object_30.current_page + 1;
            if (index <= this.object_30.last_page) {
                console.log(index, this.object_30.current_page, this.object_30.last_page);
                console.log("Chargement des prochains articles");
                this.notScrolly30 = false;
                this.init_data_30(index)
            }
        }
    }
}
