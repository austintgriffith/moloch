# Moloch React App


## Use Docker

clone repo and spin up full environment with Docker:
```
docker run -ti --rm --name clevis -p 3000:3000 -p 8545:8545 -v ~/moloch/app:/dapp austingriffith/clevis:latest
```
(note: ~/moloch/app part needs to point to the app folder where you clone moloch)

This will take a long time, but when it comes up:
```
clevis test full
```

visit:
```
http://localhost:3000/
```

## OR use Clevis Directly:

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

if you need some testnet ETH in your metamask account, add it to the metamask() function in:
```
tests/clevis.js
```
