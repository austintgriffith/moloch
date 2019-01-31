pragma solidity 0.4.24;

import "./oz/Ownable.sol";
import "./oz/SafeMath.sol";

contract GuildBank is Ownable {
    using SafeMath for uint256;

    event Withdrawal(address indexed receiver, uint256 ethAmount);

    function withdraw(address receiver, uint256 shares, uint256 totalShares) onlyOwner {
      uint256 ethAmount = token.balanceOf(this).mul(shares).div(totalShares);
      receiver.transfer(ethAmount);
      Withdrawal(receiver, ethAmount);
    }
}
