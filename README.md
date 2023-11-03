# ttss
test @brianebert/tss

## Install

1. git clone https://github.com/brianebert/ttss.git && cd ttss

2. Install tss using npm:

```shell
npm i
```

3. require/import it in your JavaScript:

```js
import { COL_Node, SigningAccount } from "@brianebert/tss";
```

### To use as a module in a Node.js project

1. Write Stellar test account public and secret key strings into a file called app.toml
```shell
TA_0 = 'G...0'
TS_0 = 'S...0'
TA_1 = 'G...1'
TS_1 = 'S...1'
```

2. Run test scriot;
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

3. Write Stellar test account public and secret key strings into browser text area
```js
{ // enter complete key strings for two accounts to test tss with
	TA_0: 'G...0',
	TS_0: 'S...0',
	TA_1: 'G...1',
	TS_1: 'S...1'
}
```