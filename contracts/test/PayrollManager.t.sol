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
    address adjudicator = address(0x3);

    uint128 constant RATE = 1e6; // $1/sec
    uint128 constant DEPOSIT = 3600e6; // $3600 = 1 hour

    function setUp() public {
        usdc = new MockUSDC();
        payroll = new PayrollManager(address(usdc), adjudicator);

        usdc.mint(employer, 10000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), type(uint256).max);
    }

    function _createAndRequestCancellation() internal returns (uint256 id) {
        vm.prank(employer);
        id = payroll.createStream(employee, RATE, DEPOSIT, "INV-APPEAL", 0);
        vm.warp(block.timestamp + 10);
        vm.prank(employer);
        payroll.requestCancellation(id, "The payer claims the remaining work was terminated before completion.");
    }

    function _appeal(uint256 id) internal {
        vm.prank(employee);
        payroll.appealCancellation(id, "https://evidence.example/cadence/appeal.json", keccak256("committed evidence"));
    }

    function _cancellationStatus(uint256 id) internal view returns (PayrollManager.CancellationStatus status) {
        (,,,,, PayrollManager.CancellationStatus current,,,,) = payroll.cancellations(id);
        return current;
    }

    function _appealDeadline(uint256 id) internal view returns (uint64 deadline) {
        (,, uint64 appealBy,,,,,,,) = payroll.cancellations(id);
        return appealBy;
    }

    function _adjudicationDeadline(uint256 id) internal view returns (uint64 deadline) {
        (,,, uint64 adjudicateBy,,,,,,) = payroll.cancellations(id);
        return adjudicateBy;
    }

    function _cancellationEscrow(uint256 id) internal view returns (uint128 escrow) {
        (,,,, uint128 held,,,,,) = payroll.cancellations(id);
        return held;
    }

    function test_CreateStream() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", 0);

        (address emp,,,,,,,, bool active,) = payroll.streams(id);
        assertEq(emp, employer);
        assertTrue(active);
    }

    function test_CreateStreamWithDeliverables_StoresExpectations() public {
        vm.prank(employer);
        uint256 id = payroll.createStreamWithDeliverables(
            employee,
            RATE,
            DEPOSIT,
            "INV-DELIVERABLES",
            "Ship the signed integration, include tests, and provide deployment notes.",
            0
        );

        assertEq(payroll.deliverables(id), "Ship the signed integration, include tests, and provide deployment notes.");
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

        (,,,,,,,, bool active,) = payroll.streams(id);
        assertFalse(active);

        usdc.mint(employer, 1000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), 1000e6);
        vm.prank(employer);
        payroll.topUp(id, 1000e6);

        (,,,,,,,, bool activeAfter,) = payroll.streams(id);
        assertTrue(activeAfter);
    }

    /// Reads just the per-second rate (tuple index 2).
    function _rate(uint256 id) internal view returns (uint128 rate) {
        (,, uint128 r,,,,,,,) = payroll.streams(id);
        return r;
    }

    /// A top-up on a RUNNING stream must raise the rate and hold the finish
    /// time fixed, rather than pushing the end date out. Here we top up
    /// halfway through a 3600s stream with enough to double the flow.
    function test_TopUp_RunningRaisesRatePreservesFinish() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);
        uint256 finishAt = block.timestamp + 3600; // original end

        // 600s in: $600 owed, $3000 unstreamed, 3000s of runway remaining.
        vm.warp(block.timestamp + 600);
        assertEq(payroll.accrued(id), 600e6);
        assertEq(payroll.runway(id), 3000);

        // Top up $3000 → new flow spreads (3000 + 3000) over the SAME 3000s = $2/s.
        usdc.mint(employer, 3000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), 3000e6);
        vm.prank(employer);
        payroll.topUp(id, 3000e6);

        assertEq(_rate(id), 2e6); // rate doubled
        assertEq(payroll.runway(id), 3000); // finish time held — still 3000s out
        assertEq(payroll.accrued(id), 600e6); // already-owed amount unchanged

        // The stream drains to exactly zero at the ORIGINAL finish, not later.
        vm.warp(finishAt);
        assertEq(payroll.accrued(id), 6600e6); // whole $6600 deposit now owed
        assertEq(payroll.runway(id), 0);
    }

    /// The employee's claimable balance must be continuous across a rate-raising
    /// top-up: what was owed the instant before equals what's owed the instant
    /// after, and a withdraw right after pays exactly the pre-top-up figure.
    function test_TopUp_RunningPreservesOwedForClaim() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.warp(block.timestamp + 900); // $900 owed, 2700s runway left
        assertEq(payroll.accrued(id), 900e6);

        // Double the unstreamed money ($2700) over the SAME runway → rate 2/s,
        // which divides the owed $900 cleanly so there's no rounding to reason
        // about here (the dust case is covered separately below).
        usdc.mint(employer, 2700e6);
        vm.prank(employer);
        usdc.approve(address(payroll), 2700e6);
        vm.prank(employer);
        payroll.topUp(id, 2700e6);

        assertEq(_rate(id), 2e6);
        // Owed is unchanged the instant after the top-up...
        assertEq(payroll.accrued(id), 900e6);
        // ...and the employee can claim exactly that, no more, no less.
        vm.prank(employee);
        payroll.withdraw(id);
        assertEq(usdc.balanceOf(employee), 900e6);
    }

    /// When the new rate doesn't divide the already-owed amount evenly, the
    /// integer re-anchoring of the claim clock can only lose SUB-SECOND dust,
    /// and always in the employer's favour (the contract never over-pays the
    /// past out of the fresh deposit). Bound it: the owed amount drops by less
    /// than one second of the new rate, and never rises.
    function test_TopUp_RunningDustBoundedInEmployerFavour() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.warp(block.timestamp + 900);
        uint128 owedBefore = payroll.accrued(id);
        assertEq(owedBefore, 900e6);

        // $5000 over 2700s → 2.851…/s, which does NOT divide $900 evenly.
        usdc.mint(employer, 5000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), 5000e6);
        vm.prank(employer);
        payroll.topUp(id, 5000e6);

        uint128 newRate = _rate(id);
        uint128 owedAfter = payroll.accrued(id);
        assertLe(owedAfter, owedBefore); // never over-pays the past
        assertLt(owedBefore - owedAfter, newRate); // loss < 1s of the new rate
    }

    /// A top-up on a SCHEDULED (not-yet-started) stream is purely additive: the
    /// rate and start are untouched and the extra funds extend the runway past
    /// the original end. Re-anchoring here would corrupt the schedule.
    function test_TopUp_ScheduledIsAdditive() public {
        uint64 start = uint64(block.timestamp + 1 days);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", start);

        vm.warp(block.timestamp + 1 hours); // still before start
        usdc.mint(employer, DEPOSIT);
        vm.prank(employer);
        usdc.approve(address(payroll), DEPOSIT);
        vm.prank(employer);
        payroll.topUp(id, DEPOSIT);

        assertEq(_rate(id), RATE); // rate untouched
        (,,, uint64 startTime,, uint128 deposit,,,,) = payroll.streams(id);
        assertEq(startTime, start); // start untouched
        assertEq(deposit, DEPOSIT * 2); // both deposits present
        // Runway now spans the doubled deposit (extends past the original end).
        assertEq(payroll.runway(id), (DEPOSIT * 2) / RATE);
    }

    /// A top-up on a fully-accrued-but-unclaimed stream (zero remaining runway)
    /// can't preserve a finish that has already arrived, so it keeps the old
    /// rate and simply gives the stream fresh runway from now.
    function test_TopUp_FullyAccruedKeepsRateAddsRunway() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.warp(block.timestamp + 3600); // fully accrued, runway 0, not yet claimed
        assertEq(payroll.accrued(id), DEPOSIT);
        assertEq(payroll.runway(id), 0);

        usdc.mint(employer, DEPOSIT);
        vm.prank(employer);
        usdc.approve(address(payroll), DEPOSIT);
        vm.prank(employer);
        payroll.topUp(id, DEPOSIT);

        assertEq(_rate(id), RATE); // rate unchanged — nothing to spread
        assertEq(payroll.accrued(id), DEPOSIT); // the owed $3600 is still owed
        assertEq(payroll.runway(id), 3600); // fresh runway on the new funds
    }

    function test_RequestCancellation_PaysAccruedAndHoldsRefund() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", 0);

        vm.warp(block.timestamp + 10);
        uint256 empBefore = usdc.balanceOf(employee);
        uint256 emplBefore = usdc.balanceOf(employer);

        vm.prank(employer);
        payroll.requestCancellation(id, "The engagement ended before the remaining scheduled work.");

        assertEq(usdc.balanceOf(employee) - empBefore, 10e6); // 10 sec accrued
        assertEq(usdc.balanceOf(employer), emplBefore); // no immediate refund
        assertEq(usdc.balanceOf(address(payroll)), DEPOSIT - 10e6); // held for appeal

        (,,,,, uint128 remaining,, uint128 withdrawn, bool active,) = payroll.streams(id);
        assertEq(remaining, DEPOSIT - 10e6);
        assertEq(withdrawn, 10e6);
        assertFalse(active);

        (
            ,
            uint64 requestedAt,
            uint64 appealDeadline,,
            uint128 escrowedRefund,
            PayrollManager.CancellationStatus status,,,,
        ) = payroll.cancellations(id);
        assertEq(appealDeadline, requestedAt + 24 hours);
        assertEq(escrowedRefund, DEPOSIT - 10e6);
        assertEq(uint8(status), uint8(PayrollManager.CancellationStatus.AppealWindow));
    }

    function test_RequestCancellation_OnlyEmployer() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.prank(employee);
        vm.expectRevert("not employer");
        payroll.requestCancellation(id, "The payee cannot request a payer-side cancellation.");
    }

    function test_RequestCancellation_RequiresSpecificReason() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.prank(employer);
        vm.expectRevert("reason too short");
        payroll.requestCancellation(id, "ended");
    }

    function test_RequestCancellation_RevertsWhenNothingIsUnstreamed() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, RATE, "INV", 0);
        vm.warp(block.timestamp + 1);

        vm.prank(employer);
        vm.expectRevert("nothing unstreamed to cancel");
        payroll.requestCancellation(id, "The payer cannot appeal money that the payee has already fully earned.");
    }

    function test_CancellationPauseBlocksWithdrawAndTopUp() public {
        uint256 id = _createAndRequestCancellation();

        vm.prank(employee);
        vm.expectRevert("stream not active");
        payroll.withdraw(id);

        vm.prank(employer);
        vm.expectRevert("cancellation pending");
        payroll.topUp(id, 100e6);

        _appeal(id);
        vm.prank(employer);
        vm.expectRevert("cancellation pending");
        payroll.topUp(id, 100e6);
    }

    function test_Appeal_OnlyPayee() public {
        uint256 id = _createAndRequestCancellation();

        vm.prank(employer);
        vm.expectRevert("not employee");
        payroll.appealCancellation(id, "https://evidence.example/cadence/appeal.json", keccak256("evidence"));
    }

    function test_Appeal_AcceptsExactDeadlineAndRejectsAfter() public {
        uint256 id = _createAndRequestCancellation();
        vm.warp(_appealDeadline(id));
        _appeal(id);
        assertEq(uint8(_cancellationStatus(id)), uint8(PayrollManager.CancellationStatus.Appealed));

        vm.warp(block.timestamp + 24 hours);
        vm.prank(adjudicator);
        payroll.resolveCancellation(id, true, keccak256("first verdict"));

        vm.prank(employer);
        payroll.requestCancellation(id, "A second cancellation request creates a new independent appeal window.");
        vm.warp(uint256(_appealDeadline(id)) + 1);

        vm.prank(employee);
        vm.expectRevert("appeal window closed");
        payroll.appealCancellation(id, "https://evidence.example/cadence/appeal-two.json", keccak256("second evidence"));
    }

    function test_Appeal_RequiresEvidenceCommitment() public {
        uint256 id = _createAndRequestCancellation();

        vm.prank(employee);
        vm.expectRevert("invalid evidence hash");
        payroll.appealCancellation(id, "https://evidence.example/cadence/appeal.json", bytes32(0));
    }

    function test_FinalizeUnappealed_IsPermissionlessAfterWindow() public {
        uint256 id = _createAndRequestCancellation();
        uint256 payerBefore = usdc.balanceOf(employer);

        vm.expectRevert("appeal window open");
        payroll.finalizeUnappealedCancellation(id);

        vm.warp(uint256(_appealDeadline(id)) + 1);
        vm.prank(address(0xBEEF));
        payroll.finalizeUnappealedCancellation(id);

        assertEq(uint8(_cancellationStatus(id)), uint8(PayrollManager.CancellationStatus.Unappealed));
        assertEq(usdc.balanceOf(employer) - payerBefore, DEPOSIT - 10e6);
        assertEq(_cancellationEscrow(id), 0);
        assertEq(_remaining(id), 0);
    }

    function test_ResolveCancellation_OnlyAdjudicator() public {
        uint256 id = _createAndRequestCancellation();
        _appeal(id);

        vm.prank(employee);
        vm.expectRevert("not adjudicator");
        payroll.resolveCancellation(id, true, keccak256("verdict"));
    }

    function test_AppealUpheld_ResumesWithoutBackpayForPausedTime() public {
        uint256 id = _createAndRequestCancellation();
        _appeal(id);
        uint128 held = _remaining(id);

        vm.warp(block.timestamp + 2 days);
        vm.prank(adjudicator);
        payroll.resolveCancellation(id, true, keccak256("appeal upheld verdict"));

        (,,,, uint64 claimAnchor, uint128 deposit,, uint128 withdrawn, bool active,) = payroll.streams(id);
        assertTrue(active);
        assertEq(deposit, held);
        assertEq(withdrawn, 10e6);
        assertEq(claimAnchor, uint64(block.timestamp));
        assertEq(payroll.accrued(id), 0); // dispute interval is not retroactively charged

        vm.warp(block.timestamp + 25);
        assertEq(payroll.accrued(id), 25e6);
        assertEq(uint8(_cancellationStatus(id)), uint8(PayrollManager.CancellationStatus.AppealUpheld));
    }

    function test_AppealRejected_RefundsHeldEscrow() public {
        uint256 id = _createAndRequestCancellation();
        _appeal(id);
        uint256 payerBefore = usdc.balanceOf(employer);
        uint128 held = _cancellationEscrow(id);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(adjudicator);
        payroll.resolveCancellation(id, false, keccak256("appeal rejected verdict"));

        assertEq(usdc.balanceOf(employer) - payerBefore, held);
        assertEq(usdc.balanceOf(address(payroll)), 0);
        assertEq(_remaining(id), 0);
        assertEq(uint8(_cancellationStatus(id)), uint8(PayrollManager.CancellationStatus.AppealRejected));
    }

    function test_ResolveCancellation_CannotReplayVerdict() public {
        uint256 id = _createAndRequestCancellation();
        _appeal(id);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(adjudicator);
        payroll.resolveCancellation(id, true, keccak256("verdict"));

        vm.prank(adjudicator);
        vm.expectRevert("not adjudicating");
        payroll.resolveCancellation(id, false, keccak256("replay"));
    }

    function test_TimedOutAppeal_RefundsPermissionlessly() public {
        uint256 id = _createAndRequestCancellation();
        _appeal(id);
        uint256 payerBefore = usdc.balanceOf(employer);

        vm.expectRevert("adjudication active");
        payroll.finalizeTimedOutAppeal(id);

        vm.warp(uint256(_adjudicationDeadline(id)) + 1);
        vm.prank(address(0xBEEF));
        payroll.finalizeTimedOutAppeal(id);

        assertEq(usdc.balanceOf(employer) - payerBefore, DEPOSIT - 10e6);
        assertEq(uint8(_cancellationStatus(id)), uint8(PayrollManager.CancellationStatus.TimedOut));

        vm.prank(adjudicator);
        vm.expectRevert("not adjudicating");
        payroll.resolveCancellation(id, true, keccak256("late verdict"));
    }

    function test_RepeatedCancellationUsesUniqueCaseId() public {
        uint256 id = _createAndRequestCancellation();
        bytes32 firstCase = payroll.cancellationCaseId(id);
        _appeal(id);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(adjudicator);
        payroll.resolveCancellation(id, true, keccak256("first verdict"));

        vm.warp(block.timestamp + 5);
        vm.prank(employer);
        payroll.requestCancellation(id, "New post-reinstatement facts support a distinct cancellation request.");
        bytes32 secondCase = payroll.cancellationCaseId(id);

        assertNotEq(firstCase, secondCase);
        assertEq(payroll.cancellationNonces(id), 2);
    }

    function test_ScheduledAppealUpheld_PreservesFutureStart() public {
        uint64 start = uint64(block.timestamp + 3 days);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", start);
        vm.prank(employer);
        payroll.requestCancellation(id, "The payer sought to end the engagement before its future scheduled start.");
        _appeal(id);

        vm.warp(block.timestamp + 1 days);
        vm.prank(adjudicator);
        payroll.resolveCancellation(id, true, keccak256("scheduled appeal upheld"));

        (,,,, uint64 claimAnchor,,,, bool active,) = payroll.streams(id);
        assertTrue(active);
        assertEq(claimAnchor, start);
        assertEq(payroll.accrued(id), 0);

        vm.warp(start + 10);
        assertEq(payroll.accrued(id), 10e6);
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

        (,,, uint64 startTime, uint64 lastClaim,,,, bool active,) = payroll.streams(id);
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

    function test_ScheduledStream_CancellationBeforeStartHoldsAll() public {
        uint64 start = uint64(block.timestamp + 1 days);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", start);

        uint256 empBefore = usdc.balanceOf(employee);
        uint256 emplBefore = usdc.balanceOf(employer);

        vm.warp(block.timestamp + 1 hours); // still before start
        vm.prank(employer);
        payroll.requestCancellation(id, "The future engagement was terminated before its scheduled start.");

        assertEq(usdc.balanceOf(employee) - empBefore, 0); // employee got nothing
        assertEq(usdc.balanceOf(employer), emplBefore); // full deposit remains held
        assertEq(usdc.balanceOf(address(payroll)), DEPOSIT);
    }

    function test_PastStartAtClampsToNow() public {
        vm.warp(1000); // default test time is 1; move forward so "past" is representable
        uint64 past = uint64(block.timestamp - 500);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001", past);

        (,,, uint64 startTime,,,,,,) = payroll.streams(id);
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

        (address payee, address payer, uint128 rate, uint128 deposit,,, PayrollManager.ReqStatus status,,) =
            payroll.requests(reqId);
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

        (address emp, address wrk, uint128 rate,,,,,, bool active,) = payroll.streams(streamId);
        assertEq(emp, employer);
        assertEq(wrk, employee);
        assertEq(rate, RATE);
        assertTrue(active);

        (,,,,,, PayrollManager.ReqStatus status,, uint256 sId) = payroll.requests(reqId);
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

        (,,,,,, PayrollManager.ReqStatus status,,) = payroll.requests(reqId);
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

        (,,,,,, PayrollManager.ReqStatus status,,) = payroll.requests(reqId);
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

        (,, uint128 rate, uint128 deposit,, uint64 deadline, PayrollManager.ReqStatus status,,) =
            payroll.requests(reqId);
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

        (address emp, address wrk, uint128 rate,,,,,, bool active,) = payroll.streams(streamId);
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

        (,,,,,, PayrollManager.ReqStatus status,,) = payroll.requests(reqId);
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

        (,,,,,, PayrollManager.ReqStatus status,,) = payroll.requests(reqId);
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

    // ---- Hardened accounting: static deposit, cumulative withdrawn, no dust ----

    /// Reads the two new accounting fields (indexes 6 and 7) from the tuple.
    function _accounting(uint256 id) internal view returns (uint128 totalDeposited, uint128 withdrawn) {
        (,,,,,, uint128 total, uint128 wd,,) = payroll.streams(id);
        return (total, wd);
    }

    function _remaining(uint256 id) internal view returns (uint128 deposit) {
        (,,,,, uint128 dep,,,,) = payroll.streams(id);
        return dep;
    }

    function test_TotalDepositedStaticAcrossWithdraw() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        (uint128 total0,) = _accounting(id);
        assertEq(total0, DEPOSIT);

        // A mid-stream withdrawal shrinks the remaining escrow but must NOT
        // change totalDeposited — that's the "static deposit on the receipt" fix.
        vm.warp(block.timestamp + 60);
        vm.prank(employee);
        payroll.withdraw(id);

        (uint128 total1, uint128 withdrawn1) = _accounting(id);
        assertEq(total1, DEPOSIT); // unchanged by the claim
        assertEq(withdrawn1, 60e6); // cumulative paid out
        assertEq(_remaining(id), DEPOSIT - 60e6); // remaining shrank
    }

    function test_TotalDepositedGrowsOnTopUp() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        usdc.mint(employer, 1000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), 1000e6);
        vm.prank(employer);
        payroll.topUp(id, 1000e6);

        (uint128 total,) = _accounting(id);
        assertEq(total, DEPOSIT + 1000e6); // only a top-up moves it
    }

    function test_WithdrawnAccumulatesAcrossMultipleClaims() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.warp(block.timestamp + 30);
        vm.prank(employee);
        payroll.withdraw(id);
        vm.warp(block.timestamp + 45);
        vm.prank(employee);
        payroll.withdraw(id);

        (, uint128 withdrawn) = _accounting(id);
        assertEq(withdrawn, 75e6); // 30 + 45, monotonic
        assertEq(usdc.balanceOf(employee), 75e6);
    }

    function test_NoDustStranded_FullDrainIsClaimable() public {
        // Deposit that is NOT a whole multiple of the rate: 5 seconds + a
        // sub-second remainder. Old contract deactivated at deposit < rate and
        // stranded that remainder; the hardened one lets the employee take it all.
        uint128 rate = 1e6;
        uint128 deposit = 5e6 + 250000; // 5.25s of pay
        usdc.mint(employer, deposit);
        vm.prank(employer);
        usdc.approve(address(payroll), deposit);
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, rate, deposit, "INV", 0);

        // Let the whole thing accrue, then withdraw.
        vm.warp(block.timestamp + 10);
        vm.prank(employee);
        payroll.withdraw(id);

        // Employee received the ENTIRE deposit — no dust left in the contract.
        assertEq(usdc.balanceOf(employee), deposit);
        assertEq(_remaining(id), 0);
        assertEq(usdc.balanceOf(address(payroll)), 0);

        (uint128 total, uint128 withdrawn) = _accounting(id);
        assertEq(total, deposit);
        assertEq(withdrawn, deposit);

        // And it's now inactive (fully settled), so no further withdrawal.
        vm.warp(block.timestamp + 5);
        vm.prank(employee);
        vm.expectRevert("stream not active");
        payroll.withdraw(id);
    }

    function test_CancellationRecordsAccruedPayoutInWithdrawn() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.warp(block.timestamp + 10);
        vm.prank(employer);
        payroll.requestCancellation(id, "The payer states the underlying engagement has been terminated.");

        (uint128 total, uint128 withdrawn) = _accounting(id);
        assertEq(total, DEPOSIT); // original commitment preserved for the receipt
        assertEq(withdrawn, 10e6); // the 10s paid at the freeze is recorded
        assertEq(_remaining(id), DEPOSIT - 10e6); // unstreamed escrow stays held
    }

    function test_ContractNeverStrandsFunds_AfterUnappealedFinalization() public {
        // After create, partial withdraw, cancellation, and expiry, everything
        // is either paid to the payee or refunded to the payer.
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV", 0);

        vm.warp(block.timestamp + 100);
        vm.prank(employee);
        payroll.withdraw(id);

        vm.warp(block.timestamp + 50);
        vm.prank(employer);
        payroll.requestCancellation(id, "The payer states the remaining engagement has been terminated.");

        vm.warp(block.timestamp + 24 hours + 1);
        payroll.finalizeUnappealedCancellation(id);

        assertEq(usdc.balanceOf(address(payroll)), 0);
        // Employee got 150s total; employer refunded the rest of the original.
        assertEq(usdc.balanceOf(employee), 150e6);
    }

    // ---- Batch creation -------------------------------------------------

    function test_CreateStreams_OpensAllAndPullsOnce() public {
        address alice = address(0xA);
        address bob = address(0xB);
        address carol = address(0xC);

        address[] memory emps = new address[](3);
        emps[0] = alice;
        emps[1] = bob;
        emps[2] = carol;

        uint128[] memory rates = new uint128[](3);
        rates[0] = RATE;
        rates[1] = 2 * RATE;
        rates[2] = 3 * RATE;

        uint128[] memory deps = new uint128[](3);
        deps[0] = 100e6;
        deps[1] = 200e6;
        deps[2] = 300e6;

        string[] memory refs = new string[](3);
        refs[0] = "A";
        refs[1] = "B";
        refs[2] = "C";

        uint256 employerBefore = usdc.balanceOf(employer);

        vm.prank(employer);
        uint256[] memory ids = payroll.createStreams(emps, rates, deps, refs, 0);

        assertEq(ids.length, 3);

        // Each stream is recorded with the CALLER as employer (not an aggregator).
        for (uint256 i = 0; i < 3; i++) {
            (address emp, address rcv, uint128 rate,,,, uint128 total,, bool active,) = payroll.streams(ids[i]);
            assertEq(emp, employer);
            assertEq(rcv, emps[i]);
            assertEq(rate, rates[i]);
            assertEq(total, deps[i]);
            assertTrue(active);
        }

        // Exactly the summed escrow moved, in one shot.
        assertEq(usdc.balanceOf(address(payroll)), 600e6);
        assertEq(employerBefore - usdc.balanceOf(employer), 600e6);

        // Streams are indexed under the employer.
        assertEq(payroll.getEmployerStreams(employer).length, 3);
    }

    function test_CreateStreamsWithDeliverables_StoresEachExpectation() public {
        address[] memory emps = new address[](2);
        emps[0] = employee;
        emps[1] = address(0x4);

        uint128[] memory rates = new uint128[](2);
        rates[0] = RATE;
        rates[1] = 2 * RATE;

        uint128[] memory deps = new uint128[](2);
        deps[0] = 1000e6;
        deps[1] = 2000e6;

        string[] memory refs = new string[](2);
        refs[0] = "INV-A";
        refs[1] = "INV-B";

        string[] memory expectations = new string[](2);
        expectations[0] = "Deliver the signed integration.";
        expectations[1] = "Deliver the tested migration and runbook.";

        vm.prank(employer);
        uint256[] memory ids = payroll.createStreamsWithDeliverables(emps, rates, deps, refs, expectations, 0);

        assertEq(payroll.deliverables(ids[0]), expectations[0]);
        assertEq(payroll.deliverables(ids[1]), expectations[1]);
    }

    function test_CreateStreamWithDeliverables_RejectsOversizedText() public {
        bytes memory oversized = new bytes(5001);

        vm.prank(employer);
        vm.expectRevert("deliverables too long");
        payroll.createStreamWithDeliverables(employee, RATE, DEPOSIT, "INV", string(oversized), 0);
    }

    function test_CreateStreams_RevertsAtomicallyOnBadRow() public {
        address[] memory emps = new address[](2);
        emps[0] = address(0xA);
        emps[1] = address(0); // invalid → whole batch must revert

        uint128[] memory rates = new uint128[](2);
        rates[0] = RATE;
        rates[1] = RATE;

        uint128[] memory deps = new uint128[](2);
        deps[0] = 100e6;
        deps[1] = 100e6;

        string[] memory refs = new string[](2);
        refs[0] = "A";
        refs[1] = "B";

        vm.prank(employer);
        vm.expectRevert("invalid employee");
        payroll.createStreams(emps, rates, deps, refs, 0);

        // Nothing was created and no funds moved.
        assertEq(payroll.getEmployerStreams(employer).length, 0);
        assertEq(usdc.balanceOf(address(payroll)), 0);
    }

    function test_CreateStreams_RevertsOnLengthMismatch() public {
        address[] memory emps = new address[](2);
        emps[0] = address(0xA);
        emps[1] = address(0xB);

        uint128[] memory rates = new uint128[](1); // wrong length
        rates[0] = RATE;

        uint128[] memory deps = new uint128[](2);
        deps[0] = 100e6;
        deps[1] = 100e6;

        string[] memory refs = new string[](2);
        refs[0] = "A";
        refs[1] = "B";

        vm.prank(employer);
        vm.expectRevert("length mismatch");
        payroll.createStreams(emps, rates, deps, refs, 0);
    }

    function test_CreateStreams_SharedStartAtSchedulesAll() public {
        address[] memory emps = new address[](2);
        emps[0] = address(0xA);
        emps[1] = address(0xB);

        uint128[] memory rates = new uint128[](2);
        rates[0] = RATE;
        rates[1] = RATE;

        uint128[] memory deps = new uint128[](2);
        deps[0] = 100e6;
        deps[1] = 100e6;

        string[] memory refs = new string[](2);
        refs[0] = "A";
        refs[1] = "B";

        uint64 startAt = uint64(block.timestamp + 1 days);
        vm.prank(employer);
        uint256[] memory ids = payroll.createStreams(emps, rates, deps, refs, startAt);

        for (uint256 i = 0; i < ids.length; i++) {
            (,,, uint64 start,,,,,,) = payroll.streams(ids[i]);
            assertEq(uint256(start), uint256(startAt));
        }
    }
}
