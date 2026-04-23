// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./interfaces/IERC20.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

/// @notice Continuous per-second USDC payroll streaming on Arc.
contract PayrollManager is ReentrancyGuard {
    IERC20 public immutable usdc;

    struct Stream {
        address employer;
        address employee;
        uint128 ratePerSecond; // USDC units (6 decimals), e.g. 1e6 = $1/sec
        uint64 startTime;
        uint64 lastClaimTime;
        uint128 deposit; // remaining employer deposit
        bool active;
        string invoiceRef; // arbitrary invoice/tax reference string
    }

    // streamId => Stream
    mapping(uint256 => Stream) public streams;
    // employer => their stream IDs
    mapping(address => uint256[]) public employerStreams;
    // employee => their stream IDs
    mapping(address => uint256[]) public employeeStreams;

    uint256 public nextStreamId;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed employer,
        address indexed employee,
        uint128 ratePerSecond,
        uint128 deposit,
        string invoiceRef
    );
    event Withdrawn(uint256 indexed streamId, address indexed employee, uint128 amount);
    event StreamToppedUp(uint256 indexed streamId, address indexed employer, uint128 amount);
    event StreamCancelled(uint256 indexed streamId, address indexed employer, uint128 refunded);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    /// @notice Employer creates a new payroll stream. Must pre-approve USDC transfer.
    /// @param employee The worker receiving the stream.
    /// @param ratePerSecond USDC per second (6 decimals). E.g. 1157407 ≈ $100/day.
    /// @param deposit Initial USDC deposit. Determines stream runway.
    /// @param invoiceRef Arbitrary invoice/tax reference (e.g. "INV-2025-001").
    function createStream(
        address employee,
        uint128 ratePerSecond,
        uint128 deposit,
        string calldata invoiceRef
    ) external nonReentrant returns (uint256 streamId) {
        require(employee != address(0), "invalid employee");
        require(ratePerSecond > 0, "rate must be > 0");
        require(deposit > 0, "deposit must be > 0");
        require(deposit >= ratePerSecond, "deposit < 1 second of pay");

        usdc.transferFrom(msg.sender, address(this), deposit);

        streamId = nextStreamId++;
        uint64 now_ = uint64(block.timestamp);

        streams[streamId] = Stream({
            employer: msg.sender,
            employee: employee,
            ratePerSecond: ratePerSecond,
            startTime: now_,
            lastClaimTime: now_,
            deposit: deposit,
            active: true,
            invoiceRef: invoiceRef
        });

        employerStreams[msg.sender].push(streamId);
        employeeStreams[employee].push(streamId);

        emit StreamCreated(streamId, msg.sender, employee, ratePerSecond, deposit, invoiceRef);
    }

    /// @notice Employee withdraws all accrued USDC from a stream.
    function withdraw(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.employee, "not employee");
        require(s.active, "stream not active");

        uint128 owed = _accrued(s);
        require(owed > 0, "nothing to withdraw");

        s.deposit -= owed;
        s.lastClaimTime = uint64(block.timestamp);

        // Auto-deactivate if deposit drained
        if (s.deposit < s.ratePerSecond) {
            s.active = false;
        }

        usdc.transfer(s.employee, owed);
        emit Withdrawn(streamId, s.employee, owed);
    }

    /// @notice Employer adds more USDC to an existing stream.
    function topUp(uint256 streamId, uint128 amount) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.employer, "not employer");
        require(amount > 0, "amount must be > 0");

        usdc.transferFrom(msg.sender, address(this), amount);
        s.deposit += amount;

        if (!s.active && s.deposit >= s.ratePerSecond) {
            s.active = true;
            s.lastClaimTime = uint64(block.timestamp);
        }

        emit StreamToppedUp(streamId, msg.sender, amount);
    }

    /// @notice Employer cancels a stream. Accrued amount goes to employee, remainder refunded.
    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.employer, "not employer");
        require(s.active, "already inactive");

        uint128 owed = _accrued(s);
        uint128 refund = s.deposit - owed;

        s.active = false;
        s.deposit = 0;

        if (owed > 0) usdc.transfer(s.employee, owed);
        if (refund > 0) usdc.transfer(s.employer, refund);

        emit StreamCancelled(streamId, msg.sender, refund);
    }

    /// @notice How much USDC has accrued since last claim (capped at deposit).
    function accrued(uint256 streamId) external view returns (uint128) {
        return _accrued(streams[streamId]);
    }

    /// @notice Seconds of runway remaining given current deposit.
    function runway(uint256 streamId) external view returns (uint256) {
        Stream storage s = streams[streamId];
        if (!s.active || s.ratePerSecond == 0) return 0;
        uint128 remaining = s.deposit - _accrued(s);
        return remaining / s.ratePerSecond;
    }

    function getEmployerStreams(address employer) external view returns (uint256[] memory) {
        return employerStreams[employer];
    }

    function getEmployeeStreams(address employee) external view returns (uint256[] memory) {
        return employeeStreams[employee];
    }

    function _accrued(Stream storage s) internal view returns (uint128) {
        if (!s.active) return 0;
        uint64 elapsed = uint64(block.timestamp) - s.lastClaimTime;
        uint128 owed = uint128(elapsed) * s.ratePerSecond;
        return owed > s.deposit ? s.deposit : owed;
    }
}
