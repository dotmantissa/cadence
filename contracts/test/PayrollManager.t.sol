// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PayrollManager} from "../src/PayrollManager.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PayrollManagerTest is Test {
    PayrollManager public payroll;
    MockUSDC public usdc;

    address employer = address(0x1);
    address employee = address(0x2);

    uint128 constant RATE = 1e6; // $1/sec
    uint128 constant DEPOSIT = 3600e6; // $3600 = 1 hour

    function setUp() public {
        usdc = new MockUSDC();
        payroll = new PayrollManager(address(usdc));

        usdc.mint(employer, 10000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), type(uint256).max);
    }

    function test_CreateStream() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", 0);

        (address emp,,,,,,bool active,) = payroll.streams(id);
        assertEq(emp, employer);
        assertTrue(active);
    }

    function test_AccruesOverTime() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", 0);

        vm.warp(block.timestamp + 100);
        assertEq(payroll.accrued(id), 100e6); // $100 accrued
    }

    function test_EmployeeWithdraws() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", 0);

        vm.warp(block.timestamp + 60);
        vm.prank(employee);
        payroll.withdraw(id);

        assertEq(usdc.balanceOf(employee), 60e6);
    }

    function test_TopUp() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, RATE, "INV-001", 0); // 1-second deposit

        vm.warp(block.timestamp + 1);
        vm.prank(employee);
        payroll.withdraw(id);

        (, , , , , , bool active,) = payroll.streams(id);
        assertFalse(active);

        usdc.mint(employer, 1000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), 1000e6);
        vm.prank(employer);
        payroll.topUp(id, 1000e6);

        (, , , , , , bool activeAfter,) = payroll.streams(id);
        assertTrue(activeAfter);
    }

    function test_CancelStream() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", 0);

        vm.warp(block.timestamp + 10);
        uint256 empBefore = usdc.balanceOf(employee);
        uint256 emplBefore = usdc.balanceOf(employer);

        vm.prank(employer);
        payroll.cancelStream(id);

        assertEq(usdc.balanceOf(employee) - empBefore, 10e6); // 10 sec accrued
        assertEq(usdc.balanceOf(employer) - emplBefore, DEPOSIT - 10e6); // remainder refunded
    }

    function test_RunwayDecreases() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, 3600e6, "INV-001", 0);
        assertEq(payroll.runway(id), 3600);

        vm.warp(block.timestamp + 600);
        assertEq(payroll.runway(id), 3000);
    }

    // ---- Scheduled streams (future startAt) ----

    function test_ScheduledStream_NoAccrualBeforeStart() public {
        uint64 start = uint64(block.timestamp + 1 days);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", start);

        (, , , uint64 startTime, uint64 lastClaim, , bool active,) = payroll.streams(id);
        assertEq(startTime, start);
        assertEq(lastClaim, start);
        assertTrue(active); // active, but not yet flowing

        // Halfway to the start: still nothing accrued, full runway.
        vm.warp(block.timestamp + 12 hours);
        assertEq(payroll.accrued(id), 0);
        assertEq(payroll.runway(id), DEPOSIT / RATE);
    }

    function test_ScheduledStream_AccruesAfterStart() public {
        uint64 start = uint64(block.timestamp + 1 days);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", start);

        // 100s past the start.
        vm.warp(start + 100);
        assertEq(payroll.accrued(id), 100e6);

        vm.prank(employee);
        payroll.withdraw(id);
        assertEq(usdc.balanceOf(employee), 100e6);
    }

    function test_ScheduledStream_WithdrawRevertsBeforeStart() public {
        uint64 start = uint64(block.timestamp + 1 days);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", start);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(employee);
        vm.expectRevert("nothing to withdraw");
        payroll.withdraw(id);
    }

    function test_ScheduledStream_CancelBeforeStartRefundsAll() public {
        uint64 start = uint64(block.timestamp + 1 days);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", start);

        uint256 empBefore = usdc.balanceOf(employee);
        uint256 emplBefore = usdc.balanceOf(employer);

        vm.warp(block.timestamp + 1 hours); // still before start
        vm.prank(employer);
        payroll.cancelStream(id);

        assertEq(usdc.balanceOf(employee) - empBefore, 0); // employee got nothing
        assertEq(usdc.balanceOf(employer) - emplBefore, DEPOSIT); // full refund
    }

    function test_PastStartAtClampsToNow() public {
        vm.warp(1000); // default test time is 1; move forward so "past" is representable
        uint64 past = uint64(block.timestamp - 500);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", past);

        (, , , uint64 startTime,,,,) = payroll.streams(id);
        assertEq(startTime, uint64(block.timestamp)); // clamped to now, not 500s ago
        assertEq(payroll.accrued(id), 0);
    }

    function test_StartTooFarOutReverts() public {
        uint64 tooFar = uint64(block.timestamp + 366 days);
        vm.prank(employer);
        vm.expectRevert("start too far out");
        payroll.createStream(employee, RATE, DEPOSIT, "INV-001", tooFar);
    }

    // ---- Stream requests + negotiation ----

    // employee is the payee here; employer is the payer being asked to fund.

    function test_RequestStream_CreatesPending() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV-REQ", 0);

        (
            address payee,
            address payer,
            uint128 rate,
            uint128 deposit,
            ,
            ,
            PayrollManager.ReqStatus status,
            ,
        ) = payroll.requests(reqId);
        assertEq(payee, employee);
        assertEq(payer, employer);
        assertEq(rate, RATE);
        assertEq(deposit, DEPOSIT);
        assertEq(uint8(status), uint8(PayrollManager.ReqStatus.Pending));

        // No funds have moved yet.
        assertEq(usdc.balanceOf(address(payroll)), 0);
    }

    function test_RequestStream_RevertsOnSelfRequest() public {
        vm.prank(employer);
        vm.expectRevert("cannot request from self");
        payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);
    }

    function test_AcceptRequest_OpensStreamAndEscrows() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV-REQ", 0);

        vm.prank(employer);
        uint256 streamId = payroll.acceptRequest(reqId);

        // Funds escrowed into the contract.
        assertEq(usdc.balanceOf(address(payroll)), DEPOSIT);

        (address emp, address wrk, uint128 rate, , , , bool active,) = payroll.streams(streamId);
        assertEq(emp, employer);
        assertEq(wrk, employee);
        assertEq(rate, RATE);
        assertTrue(active);

        (, , , , , , PayrollManager.ReqStatus status, , uint256 sId) = payroll.requests(reqId);
        assertEq(uint8(status), uint8(PayrollManager.ReqStatus.Accepted));
        assertEq(sId, streamId);

        // Stream then flows normally.
        vm.warp(block.timestamp + 100);
        assertEq(payroll.accrued(streamId), 100e6);
    }

    function test_AcceptRequest_OnlyPayer() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);

        vm.prank(employee);
        vm.expectRevert("not payer");
        payroll.acceptRequest(reqId);
    }

    function test_RejectRequest_NoFundsMoved() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);

        vm.prank(employer);
        payroll.rejectRequest(reqId);

        (, , , , , , PayrollManager.ReqStatus status, ,) = payroll.requests(reqId);
        assertEq(uint8(status), uint8(PayrollManager.ReqStatus.Rejected));
        assertEq(usdc.balanceOf(address(payroll)), 0);

        // A rejected request cannot then be accepted.
        vm.prank(employer);
        vm.expectRevert("not pending");
        payroll.acceptRequest(reqId);
    }

    function test_CancelRequest_ByPayee() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);

        vm.prank(employee);
        payroll.cancelRequest(reqId);

        (, , , , , , PayrollManager.ReqStatus status, ,) = payroll.requests(reqId);
        assertEq(uint8(status), uint8(PayrollManager.ReqStatus.Cancelled));

        // Payer can no longer accept a cancelled request.
        vm.prank(employer);
        vm.expectRevert("not pending");
        payroll.acceptRequest(reqId);
    }

    function test_CounterRequest_EscrowsDeposit() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);

        uint128 newRate = 2e6;
        uint128 newDeposit = 7200e6;

        vm.prank(employer);
        payroll.counterRequest(reqId, newRate, newDeposit, 0);

        // New deposit is escrowed immediately.
        assertEq(usdc.balanceOf(address(payroll)), newDeposit);

        (
            ,
            ,
            uint128 rate,
            uint128 deposit,
            ,
            uint64 deadline,
            PayrollManager.ReqStatus status,
            ,
        ) = payroll.requests(reqId);
        assertEq(rate, newRate);
        assertEq(deposit, newDeposit);
        assertEq(uint8(status), uint8(PayrollManager.ReqStatus.Countered));
        assertEq(deadline, uint64(block.timestamp) + 6 hours);
    }

    function test_AcceptCounter_StartsStreamInstantly() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);

        uint128 newRate = 2e6;
        uint128 newDeposit = 7200e6;
        vm.prank(employer);
        payroll.counterRequest(reqId, newRate, newDeposit, 0);

        // Payee accepts — no further payer signature; funds already escrowed.
        vm.prank(employee);
        uint256 streamId = payroll.acceptCounter(reqId);

        (address emp, address wrk, uint128 rate, , , , bool active,) = payroll.streams(streamId);
        assertEq(emp, employer);
        assertEq(wrk, employee);
        assertEq(rate, newRate);
        assertTrue(active);

        vm.warp(block.timestamp + 10);
        assertEq(payroll.accrued(streamId), 20e6); // 2/sec * 10s
    }

    function test_AcceptCounter_OnlyPayee() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);
        vm.prank(employer);
        payroll.counterRequest(reqId, 2e6, 7200e6, 0);

        vm.prank(employer);
        vm.expectRevert("not payee");
        payroll.acceptCounter(reqId);
    }

    function test_AcceptCounter_RevertsAfterWindow() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);
        vm.prank(employer);
        payroll.counterRequest(reqId, 2e6, 7200e6, 0);

        vm.warp(block.timestamp + 6 hours + 1);
        vm.prank(employee);
        vm.expectRevert("counter expired");
        payroll.acceptCounter(reqId);
    }

    function test_RejectCounter_RefundsPayer() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);

        uint128 newDeposit = 7200e6;
        uint256 payerBefore = usdc.balanceOf(employer);
        vm.prank(employer);
        payroll.counterRequest(reqId, 2e6, newDeposit, 0);
        assertEq(usdc.balanceOf(employer), payerBefore - newDeposit);

        vm.prank(employee);
        payroll.rejectCounter(reqId);

        // Escrow refunded in full to the payer.
        assertEq(usdc.balanceOf(employer), payerBefore);
        assertEq(usdc.balanceOf(address(payroll)), 0);

        (, , , , , , PayrollManager.ReqStatus status, ,) = payroll.requests(reqId);
        assertEq(uint8(status), uint8(PayrollManager.ReqStatus.Rejected));
    }

    function test_ReclaimExpiredCounter_RefundsPayer() public {
        vm.prank(employee);
        uint256 reqId = payroll.requestStream(employer, RATE, DEPOSIT, "INV", 0);

        uint128 newDeposit = 7200e6;
        uint256 payerBefore = usdc.balanceOf(employer);
        vm.prank(employer);
        payroll.counterRequest(reqId, 2e6, newDeposit, 0);

        // Before the window lapses, reclaim is not allowed.
        vm.expectRevert("not expired");
        payroll.reclaimExpiredCounter(reqId);

        vm.warp(block.timestamp + 6 hours + 1);
        // Permissionless — a third party can trigger the refund.
        vm.prank(address(0xBEEF));
        payroll.reclaimExpiredCounter(reqId);

        assertEq(usdc.balanceOf(employer), payerBefore);
        assertEq(usdc.balanceOf(address(payroll)), 0);

        (, , , , , , PayrollManager.ReqStatus status, ,) = payroll.requests(reqId);
        assertEq(uint8(status), uint8(PayrollManager.ReqStatus.Expired));

        // And an expired counter can no longer be accepted.
        vm.prank(employee);
        vm.expectRevert("no counter");
        payroll.acceptCounter(reqId);
    }

    function test_RequestIndexes() public {
        vm.prank(employee);
        uint256 r1 = payroll.requestStream(employer, RATE, DEPOSIT, "A", 0);
        vm.prank(employee);
        uint256 r2 = payroll.requestStream(employer, RATE, DEPOSIT, "B", 0);

        uint256[] memory payee = payroll.getPayeeRequests(employee);
        uint256[] memory payer = payroll.getPayerRequests(employer);
        assertEq(payee.length, 2);
        assertEq(payer.length, 2);
        assertEq(payee[0], r1);
        assertEq(payee[1], r2);
    }
}
