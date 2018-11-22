pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";

contract AnotherCoin is ERC20Mintable {

  string public name = "AnotherCoin";
  string public symbol = "AC";
  uint8 public decimals = 0;

  constructor() public {

  }

}
