# ttss
test @brianebert/tss

## Install

1. git clone https://github.com/brianebert/ttss.git && cd ttss

2. Install tss using npm:

```shell
npm i
```

3. You will need a pair of [Stellar](https://developers.stellar.org) accounts for testing. If you have accounts of your own, make sure they have 2.5 XLM available to hold as minimum balance reserve in each account. TestTss will configure your accounts with messageing token offers, post public keys for people to encrypt messages, and an automated signing key.
> If you don't have Stellar accounts available, type the line below into your shell to receive a pair of sponsored accounts you can use for testing. Each comes with 1/2 XLM with one uses for sending messages to the other. You can add XLM to either test account and use it to create private accounts for yourself using Stellar Laboratory or another tool. The test accounts will be swept up periodically to recover minimum balance reserves of the sponsoring account.

```shell
curl https://tryipfs.io/testAccounts > app.conf
```

### To use as a module in a Node.js project
1. Run test scriot;
```shell
npm run test
```
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;or
```shell
node testTss.js
```

### To use in a browser with Webpack

1. Run Webpack
```shell
npx webpack
```

2. open index.html with a browser
```shell
file://<your ttss parent directory>/ttss/index.html
```
