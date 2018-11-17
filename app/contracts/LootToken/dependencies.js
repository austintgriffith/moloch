const fs = require('fs');
module.exports = {
  'BurnableToken.sol': fs.readFileSync('contracts/oz/BurnableToken.sol', 'utf8'),
  'MintableToken.sol': fs.readFileSync('contracts/oz/MintableToken.sol', 'utf8'),
  'BasicToken.sol': fs.readFileSync('contracts/oz/BasicToken.sol', 'utf8'),
  'StandardToken.sol': fs.readFileSync('contracts/oz/StandardToken.sol', 'utf8'),
  'Ownable.sol': fs.readFileSync('contracts/oz/Ownable.sol', 'utf8'),
  'ERC20Basic.sol': fs.readFileSync('contracts/oz/ERC20Basic.sol', 'utf8'),
  'SafeMath.sol': fs.readFileSync('contracts/oz/SafeMath.sol', 'utf8'),
  'ERC20.sol': fs.readFileSync('contracts/oz/ERC20.sol', 'utf8'),
}
