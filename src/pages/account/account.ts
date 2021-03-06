import {Component, OnInit} from '@angular/core';
import {LoadingController, NavController, Refresher} from 'ionic-angular';
import {PoloniexService} from '../../services/poloniex.service';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/forkJoin';
import {Logger} from '../../services/logger.service';
import {UtilsService} from '../../services/utils.service';
import {ExchangePage} from '../exchange/exchange';
import {SettingsPage} from '../settings/settings';
import {Storage} from '@ionic/storage';

@Component({
    selector: 'page-account',
    templateUrl: 'account.html'
})
export class AccountPage implements OnInit {
    public loading = true;
    public tab: string = 'balances';
    private refreshDelay: number = 5000;

    public balances: Array<any> = [];
    public usdtBalance: any = {available: 0};
    public holdings: string = '0';
    private btcPrice: number = 0;

    public trades: Array<any> = [];
    public orders: Array<any> = [];

    constructor(private navCtrl: NavController,
                private poloniex: PoloniexService,
                private utils: UtilsService,
                private storage: Storage,
                private logger: Logger,
                private loadingCtrl: LoadingController) {
    }

    public ngOnInit(): void {
        const __this = this;

        this.storage.get('refreshDelay').then(rd => {
            if (rd) {
                this.refreshDelay = rd;
            } else {
                this.storage.set('refreshDelay', 5000);
            }
        });

        this.poloniex.subscribeToNavEvents(this.navCtrl);
        this.poloniex.$refreshState.subscribe(event => {
            if (event) this.refresh.bind(__this).call();
        });

        this.refresh.bind(__this).call();
    }

    public computeBalances(ticker: any, balances: any): void {
        this.btcPrice = ticker.USDT_BTC.last;
        let filteredBalances: Array<any> = [];

        Object.keys(balances).forEach(key => {
            if (parseFloat(balances[key].available) != 0 && key !== 'USDT') {
                filteredBalances.push(balances[key]);
                filteredBalances[filteredBalances.length - 1].coin = key;
            }
        });

        filteredBalances = filteredBalances.map(balance => {
            balance.usdtValue = this.utils.formatNb(parseFloat(balance.btcValue) * this.btcPrice);
            return balance;
        });

        this.balances = filteredBalances.sort((a, b) => a.usdtValue < b.usdtValue ? -1 : 1);
        this.usdtBalance = balances.USDT;
        const valueSum = this.balances.length ? (this.balances.length > 1 ? this.balances.reduce((a, b) => parseFloat(a.usdtValue) + parseFloat(b.usdtValue)) : parseFloat(this.balances[0].usdtValue)) : 0;
        this.holdings = this.utils.formatNb(valueSum + parseFloat(this.usdtBalance.available));
    }

    public computeTrades(trades: any): void {
        this.trades = [];
        Object.keys(trades).forEach(key => {
            this.trades.push({
                market: key.split('_')[0] + ' <-> ' + key.split('_')[1],
                data: trades[key]
            });
        });
    }

    public computeOrders(orders: any): void {
        this.orders = [];
        Object.keys(orders).forEach(key => {
            if (orders[key].length) {
                this.orders.push({
                    market: key.split('_')[0] + ' <-> ' + key.split('_')[1],
                    data: orders[key]
                });
            }
        });
    }

    public refresh(): void {
        const __this = this;

        try {
            Observable.forkJoin([
                this.poloniex.api('returnTicker'),
                this.poloniex.api('returnCompleteBalances'),
                this.poloniex.api('returnTradeHistory', ['all', null]),
                this.poloniex.api('returnOpenOrders', ['all', null]),
            ]).subscribe(data => {
                for (let i = 0; i < data.length; i++) {
                    if (data[i] === '__nonce_failure') {
                        if (!this.poloniex.refreshState) {
                            this.refresh.bind(__this).call();
                        }
                        return;
                    }
                }

                try {
                    this.computeBalances(data[0], data[1]);
                    this.computeTrades(data[2]);
                    this.computeOrders(data[3]);

                    this.loading = false;
                } catch (e) {
                    this.loading = false;
                    Logger.error(e);
                }

                if (this.poloniex.refreshState) {
                    setTimeout(this.refresh.bind(__this), this.refreshDelay);
                }
            });
        } catch (e) {
            Logger.error(e);
        }
    }

    public onCoinClick(balance: any): void {
        this.navCtrl.push(ExchangePage, {
            coin: {
                key: 'USDT_' + balance.coin
            }
        });
    }

    public onSettingsClick(): void {
        this.navCtrl.push(SettingsPage);
    }

    public toggleRefresh(refresher: Refresher): void {
        this.poloniex.toggleRefresh(refresher);
    }

    public cancelOrder(order: any, market: any): void {
        const loading = this.loadingCtrl.create();
        loading.present();

        this.poloniex.api('cancelOrder', [
            market.market.split(' ')[0],
            market.market.split(' ')[2],
            order.orderNumber
        ]).subscribe(res => {
            Logger.log(res);
            loading.dismiss();
            this.logger.alert('Success', 'Your order #' + order.orderNumber + ' was canceled.', ['OK']);
        });
    }
}
