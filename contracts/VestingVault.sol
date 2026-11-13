// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VestingVault - ERC20 Token Vesting & Equity Cliff Governance
 * @notice Provides audited linear vesting schedules with cliff locks and owner revocation.
 */
contract VestingVault {
    struct VestingSchedule {
        bool initialized;
        address beneficiary;
        uint256 cliff;
        uint256 start;
        uint256 duration;
        uint256 amountTotal;
        uint256 released;
        bool revocable;
        bool revoked;
    }

    address public owner;
    bytes32[] public scheduleIds;
    mapping(bytes32 => VestingSchedule) public schedules;
    mapping(address => uint256) public holderScheduleCount;

    event ScheduleCreated(bytes32 indexed scheduleId, address indexed beneficiary, uint256 amount);
    event TokensClaimed(bytes32 indexed scheduleId, address indexed beneficiary, uint256 amount);
    event ScheduleRevoked(bytes32 indexed scheduleId, uint256 unvestedReturned);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createVestingSchedule(
        address _beneficiary,
        uint256 _start,
        uint256 _cliffDuration,
        uint256 _duration,
        uint256 _amount,
        bool _revocable
    ) external onlyOwner returns (bytes32) {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_duration > 0, "Duration must be greater than zero");
        require(_amount > 0, "Amount must be greater than zero");
        require(_cliffDuration <= _duration, "Cliff exceeds duration");

        bytes32 scheduleId = keccak256(
            abi.encodePacked(_beneficiary, _start, scheduleIds.length, block.timestamp)
        );

        schedules[scheduleId] = VestingSchedule({
            initialized: true,
            beneficiary: _beneficiary,
            cliff: _start + _cliffDuration,
            start: _start,
            duration: _duration,
            amountTotal: _amount,
            released: 0,
            revocable: _revocable,
            revoked: false
        });

        scheduleIds.push(scheduleId);
        holderScheduleCount[_beneficiary]++;

        emit ScheduleCreated(scheduleId, _beneficiary, _amount);
        return scheduleId;
    }

    function computeReleasableAmount(bytes32 _scheduleId) public view returns (uint256) {
        VestingSchedule storage s = schedules[_scheduleId];
        if (!s.initialized || s.revoked) return 0;
        return _computeVestedAmount(s) - s.released;
    }

    function _computeVestedAmount(VestingSchedule memory s) internal view returns (uint256) {
        uint256 currentTime = block.timestamp;
        if (currentTime < s.cliff) {
            return 0;
        } else if (currentTime >= s.start + s.duration) {
            return s.amountTotal;
        } else {
            return (s.amountTotal * (currentTime - s.start)) / s.duration;
        }
    }

    function claimVestedTokens(bytes32 _scheduleId) external {
        VestingSchedule storage s = schedules[_scheduleId];
        require(s.initialized, "Schedule does not exist");
        require(msg.sender == s.beneficiary || msg.sender == owner, "Unauthorized claimer");
        require(!s.revoked, "Schedule has been revoked");

        uint256 releasable = computeReleasableAmount(_scheduleId);
        require(releasable > 0, "No releasable tokens available at this time");

        s.released += releasable;
        emit TokensClaimed(_scheduleId, s.beneficiary, releasable);
    }

    function revokeSchedule(bytes32 _scheduleId) external onlyOwner {
        VestingSchedule storage s = schedules[_scheduleId];
        require(s.initialized, "Schedule does not exist");
        require(s.revocable, "Schedule is non-revocable");
        require(!s.revoked, "Schedule already revoked");

        uint256 vested = _computeVestedAmount(s);
        uint256 unvested = s.amountTotal - vested;

        s.revoked = true;
        s.amountTotal = vested;

        emit ScheduleRevoked(_scheduleId, unvested);
    }
}
