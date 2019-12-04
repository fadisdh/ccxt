'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
// const { ExchangeError, ArgumentsRequired, ExchangeNotAvailable, InsufficientFunds, OrderNotFound, InvalidOrder, InvalidNonce, AuthenticationError } = require ('./base/errors');
const { ExchangeError, ArgumentsRequired, InvalidOrder } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class bitoasis extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'bitoasis',
            'name': 'BitOasis',
            'countries': [ 'AE', 'SA', 'KW', 'BH', 'OM', 'JO', 'EG', 'MA' ], // United Arab Emirates, Saudi Arabia, Kuwait, Bahrain, Oman, Jordan, Egypt and Morocco
            'rateLimit': 500,
            'certified': false,
            'has': {
                'cancelOrder': true,
                'CORS': true,
                'createOrder': true,
                'fetchBalance': true,
                'fetchClosedOrders': true,
                'fetchCurrencies': false,
                'fetchDepositAddress': true,
                'fetchDeposits': true,
                'fetchFundingFees': false,
                'fetchLedger': false,
                'fetchMarkets': true,
                'fetchMyTrades': false,
                'fetchOHLCV': 'emulated',
                'fetchOpenOrders': true,
                'fetchOrder': true,
                'fetchOrderBook': true,
                'fetchOrders': true,
                'fetchTicker': true,
                'fetchTrades': true,
                'fetchTradingFee': false,
                'fetchTradingFees': false,
                'fetchTradingLimits': false,
                'fetchTransactions': false,
                'fetchWithdrawals': true,
                'withdraw': true,
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/29604020-d5483cdc-87ee-11e7-94c7-d1a8d9169293.jpg', // TODO: Change logo link
                'api': {
                    'public': 'https://api.bitoasis.net/v1',
                    'private': 'https://api.bitoasis.net/v1',
                    'v1': 'https://api.bitoasis.net/v1',
                },
                'www': 'https://bitoasis.net',
                'referral': 'https://bitoasis.net',
                'doc': [
                    'https://bitoasis.docs.apiary.io',
                ],
                'fees': 'https://bitoasis.net/en/page/fees',
            },
            'api': {
                'public': {
                    'get': [
                        'exchange/pair-details',
                        'exchange/order-book/{pair}',
                        'exchange/trades/{pair}',
                        'exchange/ticker/{pair}',
                    ],
                },
                'private': {
                    'get': [
                        'exchange/balances',
                        'exchange/order/{id}',
                        'exchange/orders',
                        'exchange/orders/{pair}',
                        'exchange/coin-deposit/{id}',
                        'exchange/coin-deposits/{currency}',
                        'exchange/coin-withdrawal/{id}',
                        'exchange/coin-withdrawals/{currency}',
                    ],
                    'post': [
                        'exchange/order',
                        'exchange/cancel-order',
                        'exchange/coin-deposit',
                        'exchange/coin-withdrawal',
                    ],
                },
            },
        });
    }

    pairInfo (pair) {
        const baseAndQuote = pair.split ('-');
        const baseId = baseAndQuote[0];
        const quoteId = baseAndQuote[1];
        const base = this.safeCurrencyCode (baseId);
        const quote = this.safeCurrencyCode (quoteId);
        const symbol = base + '/' + quote;
        return {
            'pair': pair,
            'base': base,
            'baseId': baseId,
            'quote': quote,
            'quoteId': quoteId,
            'symbol': symbol,
        };
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetExchangePairDetails (params);
        const markets = this.safeValue (response, 'pairs');
        const result = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            const id = this.safeString (market, 'pair');
            const pairInfo = this.pairInfo (id);
            const base = pairInfo['base'];
            const baseId = pairInfo['baseId'];
            const quote = pairInfo['quote'];
            const quoteId = pairInfo['quoteId'];
            const symbol = pairInfo['symbol'];
            const pricePrecision = this.safeString (market, 'price_precision');
            const precision = {
                'price': pricePrecision,
            };
            const active = true;
            const minOrderSize = this.safeFloat (market, 'mimimum_order_size');
            const maxOrderSize = this.safeFloat (market, 'maximum_order_size');
            const entry = {
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'baseId': baseId,
                'quoteId': quoteId,
                'info': market,
                'active': active,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': minOrderSize,
                        'max': maxOrderSize,
                    },
                    'price': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                },
            };
            result.push (entry);
        }
        return result;
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetExchangeBalances ();
        const balances = this.safeValue (response, 'balances');
        const result = { 'info': balances };
        const currencyIds = Object.keys (balances);
        for (let i = 0; i < currencyIds.length; i++) {
            const currencyId = currencyIds[i];
            const code = this.safeCurrencyCode (currencyId);
            const account = this.account ();
            const balance = balances[currencyId];
            account['free'] = balance;
            result[code] = account;
        }
        return this.parseBalance (result);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const pair = this.marketId (symbol);
        const timestamp = this.milliseconds;
        const request = {
            'pair': pair,
        };
        if (limit !== undefined) {
            request['bids_limit'] = Math.round (limit / 2);
            request['asks_limit'] = Math.round (limit / 2);
        }
        const response = await this.publicGetExchangeOrderBookPair (request);
        const orderbook = this.parseOrderBook (response, timestamp, 'bids', 'asks', 'price', 'amount');
        return orderbook;
    }

    parseTicker (ticker, market = undefined) {
        //
        //  {
        //     "ticker": {
        //       "pair": "BTC-USD",
        //       "bid": "897.32",
        //       "ask": "916.64",
        //       "open_price": "659.49",
        //       "last_price": "903.99",
        //       "daily_low": "871",
        //       "daily_high": "1025",
        //       "daily_change": "10.58",
        //       "daily_percentage_change": "1.38"
        //     }
        //  }
        //
        const timestamp = this.milliseconds ();
        const symbol = market['symbol'];
        const last = this.safeFloat (ticker, 'last_price');
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': this.safeFloat (ticker, 'daily_high'),
            'low': this.safeFloat (ticker, 'daily_low'),
            'bid': this.safeFloat (ticker, 'bid'),
            'bidVolume': undefined,
            'ask': this.safeFloat (ticker, 'ask'),
            'askVolume': undefined,
            'vwap': undefined,
            'open': this.safeFloat (ticker, 'open_price'),
            'close': last,
            'last': last,
            'previousClose': undefined,
            'change': this.safeFloat (ticker, 'daily_change'),
            'percentage': this.safeFloat (ticker, 'daily_percentage_change'),
            'average': undefined,
            'baseVolume': undefined,
            'quoteVolume': undefined,
            'info': ticker,
        };
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'pair': market['id'],
        };
        const response = await this.publicGetExchangeTickerPair (request);
        const tickerData = this.safeValue (response, 'ticker');
        return this.parseTicker (tickerData, market);
    }

    parseTrade (trade, market = undefined) {
        //
        //  {
        //     "id": 215112,
        //     "type": "buy",
        //     "price": "778.4",
        //     "amount": "0.01",
        //     "timestamp": 1481553232
        //  }
        //
        let timestamp = this.safeInteger (trade, 'timestamp');
        timestamp = timestamp * 1000; // Convert to milliseconds
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'amount');
        const id = this.safeString (trade, 'id');
        const side = this.safeString (trade, 'type');
        const symbol = this.safeString (market, 'symbol');
        return {
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'id': id,
            'order': undefined,
            'type': undefined,
            'takerOrMaker': undefined,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': price * amount,
            'fee': undefined,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'pair': market['id'],
        };
        if (since !== undefined) {
            request['from_date'] = Math.round (since / 1000); // Convert to seconds
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetExchangeTradesPair (request);
        const tradesData = this.safeValue (response, 'trades');
        return this.parseTrades (tradesData, market, since, limit);
    }

    parseOrderStatus (status) {
        const statuses = {
            'OPEN': 'open',
            'DONE': 'closed',
            'CANCELED': 'canceled',
        };
        return this.safeString (statuses, status, status);
    }

    parseOrder (order, market = undefined) {
        //
        //  {
        //     id: 1096341,
        //     pair: 'BTC-AED',
        //     side: 'buy',
        //     type: 'limit',
        //     amount_BTC: '0.0005',
        //     amount_AED: '-0.49',
        //     price: '999.985',
        //     avg_execution_price: null,
        //     fee: '0.00250',
        //     date_created: '2019-09-02T11:51:21+00:00',
        //     status: 'OPEN'
        //  }
        //
        const pair = this.safeString (order, 'pair');
        const pairInfo = this.pairInfo (pair);
        const symbol = pairInfo['symbol'];
        const status = this.parseOrderStatus (this.safeString (order, 'status'));
        const dateCreated = this.safeString (order, 'date_created');
        const timestamp = this.parseDate (dateCreated);
        const amountProperty = 'amount_' + pairInfo['base'];
        const filledProperty = 'amount_' + pairInfo['quote'];
        const amount = this.safeFloat (order, amountProperty);
        const cost = this.safeFloat (order, filledProperty);
        const price = this.safeFloat (order, 'price');
        const remaining = undefined;
        const id = this.safeString (order, 'id');
        const type = this.safeStringLower (order, 'type');
        const side = this.safeStringLower (order, 'side');
        const fee = this.safeFloat (order, 'fee');
        const average = this.safeFloat (order, 'avg_execution_price');
        return {
            'info': order,
            'id': id,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': undefined,
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'average': average,
            'filled': undefined,
            'remaining': remaining,
            'status': status,
            'fee': fee,
            'trades': undefined,
        };
    }

    parseOrders (orders, market = undefined, since = undefined, limit = undefined, params = {}) {
        const results = [];
        for (let i = 0; i < orders.length; i++) {
            results.push (this.parseOrder (orders[i], market));
        }
        return results;
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        const pair = this.marketId (symbol);
        const request = {
            'pair': pair,
            'amount': this.amountToPrecision (symbol, amount),
            'type': type,
            'side': side,
        };
        let priceIsRequired = false;
        let stopPriceIsRequired = false;
        if (type === 'limit') {
            priceIsRequired = true;
        } else if (type === 'stop') {
            stopPriceIsRequired = true;
        } else if (type === 'stop_limit') {
            stopPriceIsRequired = true;
            priceIsRequired = true;
        }
        if (priceIsRequired) {
            if (price === undefined) {
                throw new InvalidOrder (this.id + ' createOrder method requires a price argument for a ' + type + ' order');
            }
            request['price'] = this.priceToPrecision (symbol, price);
        }
        if (stopPriceIsRequired) {
            const stopPrice = this.safeFloat (params, 'stopPrice');
            if (stopPrice === undefined) {
                throw new InvalidOrder (this.id + ' createOrder method requires a stopPrice extra param for a ' + type + ' order');
            } else {
                params = this.omit (params, 'stopPrice');
                request['stopPrice'] = this.priceToPrecision (symbol, stopPrice);
            }
        }
        const response = await this.privatePostExchangeOrder (request);
        const orderData = this.safeValue (response, 'order');
        return this.parseOrder (orderData);
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        const request = {
            'id': id,
        };
        const response = await this.privateGetExchangeOrderId (request);
        const orderData = this.safeValue (response, 'order');
        return this.parseOrder (orderData);
    }

    async fetchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let pair = undefined;
        if (symbol !== undefined) {
            pair = this.marketId (symbol);
        }
        const request = { };
        if (since !== undefined) {
            request['from_date'] = Math.round (since / 1000); // Convert to seconds
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const status = this.safeString (params, 'status');
        if (status !== undefined) {
            request['status'] = status;
        }
        let response = undefined;
        if (pair === undefined) {
            response = await this.privateGetExchangeOrders (this.extend (request, params));
        } else {
            request['pair'] = pair;
            response = await this.privateGetExchangeOrdersPair (this.extend (request, params));
        }
        const ordersData = this.safeValue (response, 'orders');
        return this.parseOrders (ordersData, undefined, since, limit);
    }

    fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        return this.fetchOrders (symbol, since, limit, this.extend (params, { 'status': 'OPEN' }));
    }

    fetchClosedOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        return this.fetchOrders (symbol, since, limit, this.extend (params, { 'status': 'DONE' }));
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        const request = {
            'id': id,
        };
        const response = await this.privatePostExchangeCancelOrder (request);
        const orderData = this.safeValue (response, 'order');
        return this.parseOrder (orderData);
    }

    parseDepositStatus (status) {
        const statuses = {
            'UNCONFIRMED': 'pending',
            'PENDING': 'pending',
            'DONE': 'ok',
            // TODO: we don't have faliure
            'FAILED': 'failed',
            'CANCELED': 'canceled',
        };
        return this.safeString (statuses, status, status);
    }

    parseDeposit (deposit) {
        //
        //  {
        //     "deposit": {
        //         "id": 3,
        //         "amount": {
        //             "value": "0.02",
        //             "currency": "BTC"
        //         },
        //         "tx_hash": "9654c06b2b94b73640095f1e73455767a42bbce3656b8c06968bbc7cfb9a1627",
        //         "date_created": "2015-02-12T15:22:22+00:00",
        //         "status": "PENDING",
        //         "deposit_address": "3Asaqyq7g1kLnT7nrpmWh1wPWyvRD7b5eD"
        //         "parsed_deposit_address": {
        //             "address": "3Asaqyq7g1kLnT7nrpmWh1wPWyvRD7b5eD"
        //         }
        //     }
        //  }
        //
        const id = this.safeString (deposit, 'id');
        const txId = this.safeString (deposit, 'tx_hash');
        const dateCreated = this.safeString (deposit, 'date_created');
        const timestamp = this.parseDate (dateCreated);
        const parsedAddress = this.safeValue (deposit, 'parsed_deposit_address');
        const addressFrom = this.safeString (parsedAddress, 'address');
        const tagFrom = this.safeString (parsedAddress, 'address_id');
        const amountObject = this.safeValue (deposit, 'amount');
        const amount = this.safeFloat (amountObject, 'value');
        const currency = this.safeString (amountObject, 'currency');
        const status = this.safeString (amountObject, 'status');
        return {
            'info': deposit,
            'id': id,
            'txid': txId,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'addressFrom': addressFrom,
            'address': addressFrom,
            'addressTo': undefined,
            'tagFrom': tagFrom,
            'tag': tagFrom,
            'tagTo': undefined,
            'type': 'deposit',
            'amount': amount,
            'currency': currency,
            'status': this.parseDepositStatus (status),
            'updated': timestamp,
            'comment': undefined,
            'fee': undefined,
        };
    }

    parseDeposits (deposits) {
        if (deposits === undefined) {
            return [];
        } else {
            const results = [];
            for (let i = 0; i.length < deposits.length; i++) {
                results.push (this.extend (this.parseWithdrawal (deposits[i])));
            }
            return results;
        }
    }

    async fetchDeposit (id, params = {}) {
        if (id === undefined) {
            throw new ArgumentsRequired ('Deposit id is required');
        }
        const request = {
            'id': id,
        };
        const response = await this.privateGetExchangeCoinDepositId (this.extend (request, params));
        const depositData = this.safeValue (response, 'deposit');
        return this.parseDeposit (depositData);
    }

    async fetchDeposits (code = undefined, since = undefined, limit = undefined, params = {}) {
        if (code === undefined) {
            throw new ArgumentsRequired ('Currency code is required');
        }
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'currency': currency['id'],
        };
        if (since !== undefined) {
            request['from_date'] = Math.round (since / 1000); // Convert to seconds
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.privateGetExchangeCoinDepositsCurrency (this.extend (request, params));
        const depositList = this.safeValue (response, 'deposits');
        return this.parseDeposits (depositList);
    }

    parseWithdrawalStatus (status) {
        const statuses = {
            'PROCESSING': 'pending',
            'PENDING': 'pending',
            'DONE': 'ok',
            // TODO: we don't have faliure
            'FAILED': 'failed',
            'CANCELED': 'canceled',
        };
        return this.safeString (statuses, status, status);
    }

    parseWithdrawal (withdrawal) {
        //
        //  {
        //     "id": 2,
        //     "amount": {
        //       "value": "1000",
        //       "currency": "XRP"
        //     },
        //     "amount_withdrawn": {
        //       "value": "999.98",
        //       "currency": "XRP"
        //     },
        //     "amount_fee": {
        //       "value": "0.02",
        //       "currency": "XRP"
        //     },
        //     "tx_hash": "B3A0933E67BF16DD3F5A470C20C26D71E2305EB26C69FD2F35F527EA6082916D",
        //     "date_created": "2018-01-12T15:22:22+00:00",
        //     "status": "PENDING",
        //     "withdrawal_address": "Address: rLW9gnQo7BQhU6igk5keqYnH3TVrCxGRzm, Tag: 2781997917",
        //     "parsed_withdrawal_address": {
        //       "address": "rLW9gnQo7BQhU6igk5keqYnH3TVrCxGRzm",
        //       "address_id": 2781997917
        //     }
        //  }
        //
        const id = this.safeString (withdrawal, 'id');
        const txId = this.safeString (withdrawal, 'tx_hash');
        const dateCreated = this.safeString (withdrawal, 'date_created');
        const timestamp = this.parseDate (dateCreated);
        const parsedAddress = this.safeValue (withdrawal, 'parsed_withdrawal_address');
        const addressTo = this.safeString (parsedAddress, 'address');
        const tagTo = this.safeString (parsedAddress, 'address_id');
        const amountObject = this.safeValue (withdrawal, 'amount_withdrawn');
        const amount = this.safeFloat (amountObject, 'value');
        const currency = this.safeString (amountObject, 'currency');
        const feeObject = this.safeValue (withdrawal, 'amount_fee');
        const feeAmount = this.safeFloat (feeObject, 'value');
        const feeCurrency = this.safeString (feeObject, 'currency');
        const status = this.safeString (amountObject, 'status');
        return {
            'info': withdrawal,
            'id': id,
            'txid': txId,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'addressFrom': undefined,
            'address': addressTo,
            'addressTo': addressTo,
            'tagFrom': undefined,
            'tag': tagTo,
            'tagTo': tagTo,
            'type': 'withdrawal',
            'amount': amount,
            'currency': currency,
            'status': this.parseWithdrawalStatus (status),
            'updated': timestamp,
            'comment': undefined,
            'fee': {
                'currency': feeCurrency,
                'cost': feeAmount,
                'rate': undefined,
            },
        };
    }

    parseWithdrawals (withdrawals) {
        if (withdrawals === undefined) {
            return [];
        } else {
            const results = [];
            for (let i = 0; i.length < withdrawals.length; i++) {
                results.push (this.extend (this.parseWithdrawal (withdrawals[i])));
            }
            return results;
        }
    }

    async fetchWithdrawal (id, params = {}) {
        if (id === undefined) {
            throw new ArgumentsRequired ('Withdrawal id is required');
        }
        const request = {
            'id': id,
        };
        const response = await this.privateGetExchangeCoinWithdrawalId (this.extend (request, params));
        const withdrawalData = this.safeValue (response, 'withdrawal');
        return this.parseWithdrawal (withdrawalData);
    }

    async fetchWithdrawals (code = undefined, since = undefined, limit = undefined, params = {}) {
        if (code === undefined) {
            throw new ArgumentsRequired ('Currency code is required');
        }
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'currency': currency['id'],
        };
        if (since !== undefined) {
            request['from_date'] = Math.round (since / 1000); // Convert to seconds
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.privateGetExchangeCoinWithdrawalsCurrency (this.extend (request, params));
        const withdrawalList = this.safeValue (response, 'withdrawals');
        return this.parseWithdrawals (withdrawalList);
    }

    async fetchDepositAddress (code, params = {}) {
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'currency': currency['id'],
        };
        const response = await this.privatePostExchangeCoinDeposit (this.extend (request, params));
        const parsedAddress = this.safeValue (response, 'parsed_address');
        const address = this.safeString (parsedAddress, 'address');
        const tag = this.safeString (parsedAddress, 'address_id');
        this.checkAddress (address);
        return {
            'currency': code,
            'address': this.checkAddress (address),
            'tag': tag,
            'info': response,
        };
    }

    async withdraw (code, amount, address, tag = undefined, params = {}) {
        this.checkAddress (address);
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'currency': currency['id'],
            'amount': parseFloat (amount),
            'withdrawal_address': address,
        };
        if (tag !== undefined) {
            request['withdrawal_address_id'] = tag;
        }
        const response = await this.privatePostExchangeCoinWithdrawal (this.extend (request, params));
        return {
            'info': response,
            'id': this.safeString (response, 'id'),
        };
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'][api];
        url += '/' + path;
        if (api === 'private') {
            if (this.token === undefined) {
                // TODO: update this message url
                throw new ExchangeError ('You have to set the token value, you can generate a token from https://bitoasis.net/settings/api');
            }
            if (headers === undefined) {
                headers = {};
            }
            headers = this.extend (headers, { 'Authorization': 'Bearer ' + this.token });
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        const pair = this.safeString (params, 'pair');
        if (pair) {
            path = path.replace ('{pair}', pair);
        }
        const currency = this.safeString (params, 'currency');
        if (currency) {
            path = path.replace ('{currency}', currency);
        }
        const id = this.safeString (params, 'id');
        if (id) {
            path = path.replace ('{id}', id);
        }
        if (headers === undefined) {
            headers = {};
        }
        headers = this.extend (headers, { 'Content-Type': 'application/json' });
        if (method === 'GET') {
            const query = [];
            const keys = Object.keys (params);
            for (let i = 0; i < keys.length; i++) {
                query.push (this.encodeURIComponent (keys[i]) + '=' + this.encodeURIComponent (params[keys[i]]));
            }
            path = path + '?' + query.join ('&');
        } else if (method === 'POST') {
            body = this.json (params);
        }
        return this.fetch2 (path, api, method, params, headers, body);
    }
};
