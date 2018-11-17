Moloch React App

clone down and run:
```
clevis init;npm i
```

bring up gananche
```
ganache-cli -h 0.0.0.0 -p 8545
```

compile, deploy, test, and publish
```
clevis test full
```

frontend comes up with:
```
npm start
```

visit:
```
http://localhost:3000/
```

moloch deploy arguments are here:
```
contracts/Moloch/arguments.js
```

if you need some testnet ETH in your metamask account, add it to the metamask() function in:
```
tests/clevis.js
```
