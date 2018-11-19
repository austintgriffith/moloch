pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";

contract SomeCoin is ERC20Mintable {

  string public name = "SomeCoin";
  string public symbol = "SC";
  uint8 public decimals = 0;

  constructor() public {

  }

}
