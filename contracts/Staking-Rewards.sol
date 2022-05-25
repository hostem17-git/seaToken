//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";
contract TKNLocker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;

    Counters.Counter private _lockerIdTracker;

    struct Locker {
        uint256 lockerID; 
        IERC20 token;
        uint256 state;  // 0 -> locker not created, 1 -> locked, 2-> unlocked
        uint256 amount;
        address lockerOwner;
        uint256 tokensClaimed;
    }

    // Mapping owner address to locker
    mapping (address => Locker) public lockers;

    // Mapping from locker ID to owner address
    mapping(uint256 => address) private _owners;

    uint256 public cliff_time;

    IERC20 public Token = IERC20(address(0x4B57f22752836bd5470d373C0427AC6d349ab34c));

    bool public tokenDistributionStarted = false;

    uint256 tokenDecimals = 18;
    uint256 minLockup     = 15000;
    bool public lockupWindow = false;

    function updateToken(IERC20 _token)public onlyOwner{
        Token = IERC20(_token);
    }
    
    function enableLockupWindow() external onlyOwner {
        require(tokenDistributionStarted == false, "Can't start lockup once token distribution has started");
        lockupWindow = true;
    }

    function disableLockupWindow() external onlyOwner {
        require(tokenDistributionStarted == false, "Can't start lockup once token distribution has started");
        lockupWindow = false;
    }
    
    function enableTokenDistribution() external onlyOwner {
        require(lockupWindow == false, "Can't enable token distribution when lockup window is still open");
        require(tokenDistributionStarted == false, "Can't enable token distribution when it is already active");
        cliff_time = block.timestamp;
        tokenDistributionStarted = true;
    }


    function getCorrectAmount(IERC20 token, uint256 _amount) internal returns (uint256) {
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 afterAmount   = token.balanceOf(address(this));

        return afterAmount.sub(beforeBalance);
    }
    
    function lock(uint256 _amount) external {
        require(lockupWindow == true, 'TL: Lockup window is closed');
        require(_amount >= (minLockup).mul(10**tokenDecimals), "Amount cannot be less than 15000 Tokens");
        uint256 amount = getCorrectAmount(Token, _amount); // To accommodate any such tax tokens
        Locker storage locker = lockers[msg.sender];

        if (lockers[msg.sender].state == 1) {                   // for locked
            locker.amount         = (locker.amount).add(amount); 
        } 
        
        else if (lockers[msg.sender].state == 2) {              // for unlocked       
            locker.state          = 1;
            locker.amount         = amount;
            locker.tokensClaimed  = 0;
        } 
        
        else {                                                  // for first time creation of locker 
            locker.lockerID       = _lockerIdTracker.current();
            locker.token          = Token;
            locker.state          = 1;
            locker.amount         = amount;
            locker.lockerOwner    = msg.sender;
            locker.tokensClaimed  = 0;

            _owners[locker.lockerID] = msg.sender;
            _lockerIdTracker.increment();
        }
    }

    function unlockAndCancel() external {
        require(lockers[msg.sender].state != 2, 'TL: cannot claim from cancelled locker');
        uint256 amountOutstanding = lockers[msg.sender].amount - lockers[msg.sender].tokensClaimed;
        lockers[msg.sender].token.safeTransfer(msg.sender, amountOutstanding);
        lockers[msg.sender].state  = 2;
        lockers[msg.sender].tokensClaimed = lockers[msg.sender].amount;
    }

    function calculateClaimableAmount(address _user) public view returns (uint256) {
        require(lockers[msg.sender].state == 1, "TL: Cannot claim");
        uint256 elapsedTime     = block.timestamp - cliff_time;
        uint256 elapsedTimeDays = (elapsedTime / 1 minutes) + 1;
        console.log(elapsedTimeDays);

        if(elapsedTimeDays > 89) {
            return lockers[_user].amount - lockers[_user].tokensClaimed;
        }

        uint256 claimAmount     = (elapsedTimeDays).mul(lockers[_user].amount).div(90) - lockers[_user].tokensClaimed;

        return claimAmount;
    }

    function withdraw() external {
        require(tokenDistributionStarted == true, 'TL: cannot claim before token generation event');
        require(lockers[msg.sender].state == 1, 'TL: Not eligible to claim');

        uint256 claimableAmount = calculateClaimableAmount(msg.sender);
        Token.safeTransfer(msg.sender, claimableAmount);
        lockers[msg.sender].tokensClaimed += claimableAmount;
    }

    function totalLockers() external view returns (uint256) {
        return _lockerIdTracker.current();
    }

    function getLockerInfo(uint256 _id) external view returns (Locker memory) {
        return lockers[_owners[_id]];
    }
}