// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./interfaces/IERC20.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

/// @notice Continuous per-second USDC payroll streaming on Arc.
contract PayrollManager is ReentrancyGuard {
    IERC20 public immutable usdc;
    address public immutable adjudicator;

    struct Stream {
        address employer;
        address employee;
        uint128 ratePerSecond; // USDC units (6 decimals), e.g. 1e6 = $1/sec
        uint64 startTime;
        uint64 lastClaimTime;
        uint128 deposit; // remaining escrow balance (shrinks on withdraw, 0 on cancel/drain)
        uint128 totalDeposited; // STATIC: original deposit + all top-ups; only grows on topUp
        uint128 withdrawn; // cumulative USDC paid out to the employee (monotonic)
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

    // ---- Adjudicated cancellation --------------------------------------

    /// @notice A payer's cancellation pauses a stream while its unstreamed
    /// escrow remains locked. The payee has 24 hours to file an appeal, after
    /// which a GenLayer verdict can either resume the stream or release the
    /// held escrow to the payer.
    enum CancellationStatus {
        None,
        AppealWindow,
        Appealed,
        AppealUpheld,
        AppealRejected,
        Unappealed,
        TimedOut
    }

    struct Cancellation {
        uint64 nonce;
        uint64 requestedAt;
        uint64 appealDeadline;
        uint64 adjudicationDeadline;
        uint128 escrowedRefund;
        CancellationStatus status;
        bytes32 evidenceHash;
        bytes32 verdictHash;
        string reason;
        string evidenceUri;
    }

    uint64 public constant APPEAL_WINDOW = 24 hours;
    uint64 public constant ADJUDICATION_TIMEOUT = 7 days;

    // streamId => latest cancellation request
    mapping(uint256 => Cancellation) public cancellations;
    // streamId => monotonically increasing cancellation request nonce
    mapping(uint256 => uint64) public cancellationNonces;

    // ---- Stream requests + negotiation ----------------------------------

    /// @notice Lifecycle of a stream request.
    /// Pending   → payee asked payer to open a stream (no funds moved yet).
    /// Countered → payer proposed different terms and ESCROWED the deposit.
    /// Accepted  → became a live stream (terminal).
    /// Rejected  → payer declined the request, or payee declined the counter (terminal).
    /// Cancelled → payee withdrew their own request (terminal).
    /// Expired   → counter-offer window lapsed and escrow was reclaimed (terminal).
    enum ReqStatus {
        Pending,
        Countered,
        Accepted,
        Rejected,
        Cancelled,
        Expired
    }

    struct StreamRequest {
        address payee; // who will receive the stream (creator of the request)
        address payer; // who will fund the stream
        uint128 ratePerSecond; // current proposed rate
        uint128 deposit; // current proposed deposit (escrowed once Countered)
        uint64 startAt; // requested stream start (0 = start on accept)
        uint64 counterDeadline; // when a Countered offer auto-expires
        ReqStatus status;
        string invoiceRef;
        uint256 streamId; // set once Accepted
    }

    /// @notice How long a payer's counter-offer stays open before it can be reclaimed.
    uint64 public constant COUNTER_WINDOW = 6 hours;

    // requestId => StreamRequest
    mapping(uint256 => StreamRequest) public requests;
    // payer => request IDs addressed to them
    mapping(address => uint256[]) public payerRequests;
    // payee => request IDs they created
    mapping(address => uint256[]) public payeeRequests;

    uint256 public nextRequestId;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed employer,
        address indexed employee,
        uint128 ratePerSecond,
        uint128 deposit,
        string invoiceRef,
        uint64 startTime
    );
    event Withdrawn(uint256 indexed streamId, address indexed employee, uint128 amount);
    event StreamToppedUp(uint256 indexed streamId, address indexed employer, uint128 amount);
    event CancellationRequested(
        uint256 indexed streamId,
        uint64 indexed nonce,
        address indexed employer,
        uint128 accruedPaid,
        uint128 escrowedRefund,
        uint64 appealDeadline,
        bytes32 caseId,
        string reason
    );
    event CancellationAppealed(
        uint256 indexed streamId,
        uint64 indexed nonce,
        address indexed employee,
        bytes32 caseId,
        bytes32 evidenceHash,
        string evidenceUri,
        uint64 adjudicationDeadline
    );
    event CancellationResolved(
        uint256 indexed streamId,
        uint64 indexed nonce,
        bytes32 indexed caseId,
        bool appealUpheld,
        uint128 refunded,
        bytes32 verdictHash
    );
    event CancellationFinalized(
        uint256 indexed streamId, uint64 indexed nonce, CancellationStatus status, uint128 refunded
    );

    event RequestCreated(
        uint256 indexed requestId,
        address indexed payee,
        address indexed payer,
        uint128 ratePerSecond,
        uint128 deposit,
        uint64 startAt,
        string invoiceRef
    );
    event RequestCountered(
        uint256 indexed requestId, uint128 ratePerSecond, uint128 deposit, uint64 startAt, uint64 counterDeadline
    );
    event RequestAccepted(uint256 indexed requestId, uint256 indexed streamId);
    event RequestRejected(uint256 indexed requestId, address indexed by);
    event RequestCancelled(uint256 indexed requestId, address indexed by);
    event RequestExpired(uint256 indexed requestId, uint128 refunded);

    constructor(address _usdc, address _adjudicator) {
        require(_usdc != address(0), "invalid usdc");
        require(_adjudicator != address(0), "invalid adjudicator");
        usdc = IERC20(_usdc);
        adjudicator = _adjudicator;
    }

    /// @notice Employer creates a new payroll stream. Must pre-approve USDC transfer.
    /// @param employee The worker receiving the stream.
    /// @param ratePerSecond USDC per second (6 decimals). E.g. 1157407 ≈ $100/day.
    /// @param deposit Initial USDC deposit. Determines stream runway.
    /// @param invoiceRef Arbitrary invoice/tax reference (e.g. "INV-2025-001").
    /// @param startAt Unix time the stream begins accruing. 0 (or any past time)
    ///        means start now; a future time schedules the stream — funds are
    ///        escrowed on creation but nothing accrues until `startAt`.
    function createStream(
        address employee,
        uint128 ratePerSecond,
        uint128 deposit,
        string calldata invoiceRef,
        uint64 startAt
    ) external nonReentrant returns (uint256 streamId) {
        _validateTerms(employee, ratePerSecond, deposit);
        usdc.transferFrom(msg.sender, address(this), deposit);
        streamId = _openStream(msg.sender, employee, ratePerSecond, deposit, invoiceRef, startAt);
    }

    /// @notice Open many payroll streams in a single transaction. The caller is
    ///         recorded as employer for every stream (so they can top up / cancel
    ///         each one) and the whole batch's escrow is pulled in ONE
    ///         `transferFrom`, so a payer signs and approves once for the lot.
    ///
    ///         This exists because a generic multicall can't be used here:
    ///         `createStream` binds the employer and the funds source to
    ///         `msg.sender`, which for an aggregator would be the aggregator
    ///         itself. Batching must live in the contract to keep the payer as
    ///         the caller.
    /// @param employees      One recipient per stream.
    /// @param ratesPerSecond USDC/sec for each stream (6 decimals).
    /// @param deposits       Initial escrow for each stream.
    /// @param invoiceRefs    Per-stream invoice/tax reference.
    /// @param startAt        Shared start time for the whole batch (0 = now).
    /// @dev All four arrays must be the same, non-zero length. Every entry is
    ///      validated before any funds move, so a single bad row reverts the
    ///      entire batch — callers never end up with a partially-created set.
    function createStreams(
        address[] calldata employees,
        uint128[] calldata ratesPerSecond,
        uint128[] calldata deposits,
        string[] calldata invoiceRefs,
        uint64 startAt
    ) external nonReentrant returns (uint256[] memory streamIds) {
        uint256 n = employees.length;
        require(n > 0, "no streams");
        require(ratesPerSecond.length == n && deposits.length == n && invoiceRefs.length == n, "length mismatch");

        // Validate every row and total the escrow BEFORE moving any funds, so an
        // invalid entry reverts the batch without a wasted transfer.
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            _validateTerms(employees[i], ratesPerSecond[i], deposits[i]);
            total += deposits[i];
        }

        // One transfer for the whole batch, then record each stream.
        usdc.transferFrom(msg.sender, address(this), total);

        streamIds = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            streamIds[i] =
                _openStream(msg.sender, employees[i], ratesPerSecond[i], deposits[i], invoiceRefs[i], startAt);
        }
    }

    /// @dev Shared term checks for both direct streams and requests.
    function _validateTerms(address employee, uint128 ratePerSecond, uint128 deposit) internal pure {
        require(employee != address(0), "invalid employee");
        require(ratePerSecond > 0, "rate must be > 0");
        require(deposit > 0, "deposit must be > 0");
        require(deposit >= ratePerSecond, "deposit < 1 second of pay");
    }

    /// @dev Records a stream assuming `deposit` USDC is already held by this
    ///      contract. Callers must move funds in first (direct create / accept)
    ///      or have escrowed them earlier (accepting a counter-offer).
    function _openStream(
        address employer,
        address employee,
        uint128 ratePerSecond,
        uint128 deposit,
        string memory invoiceRef,
        uint64 startAt
    ) internal returns (uint256 streamId) {
        streamId = nextStreamId++;
        uint64 now_ = uint64(block.timestamp);
        // Clamp a zero/past startAt to now; cap how far ahead scheduling can go.
        uint64 start = startAt > now_ ? startAt : now_;
        require(start <= now_ + 365 days, "start too far out");

        streams[streamId] = Stream({
            employer: employer,
            employee: employee,
            ratePerSecond: ratePerSecond,
            startTime: start,
            lastClaimTime: start,
            deposit: deposit,
            totalDeposited: deposit,
            withdrawn: 0,
            active: true,
            invoiceRef: invoiceRef
        });

        employerStreams[employer].push(streamId);
        employeeStreams[employee].push(streamId);

        emit StreamCreated(streamId, employer, employee, ratePerSecond, deposit, invoiceRef, start);
    }

    /// @notice Employee withdraws all accrued USDC from a stream.
    function withdraw(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.employee, "not employee");
        require(s.active, "stream not active");

        uint128 owed = _accrued(s);
        require(owed > 0, "nothing to withdraw");

        s.deposit -= owed;
        s.withdrawn += owed;
        s.lastClaimTime = uint64(block.timestamp);

        // Deactivate only when the escrow is fully drained. Because `_accrued`
        // caps at the whole remaining deposit, once elapsed time covers the
        // balance the employee's withdrawal takes ALL of it — no sub-second
        // "dust" can strand in the contract. A stream with runway left stays
        // active regardless of rate.
        if (s.deposit == 0) {
            s.active = false;
        }

        usdc.transfer(s.employee, owed);
        emit Withdrawn(streamId, s.employee, owed);
    }

    /// @notice Employer adds more USDC to an existing stream.
    ///
    /// @dev Behaviour depends on the stream's phase:
    ///
    ///  - **Running** (active and past its start): the finish time is held FIXED
    ///    and the rate is RAISED so the added funds are spread over the runway
    ///    that remains, instead of pushing the end date out. The already-accrued
    ///    (but unclaimed) amount is preserved by re-anchoring the claim clock:
    ///    we pick `lastClaimTime` so that `(now - lastClaimTime) * newRate` equals
    ///    what was already owed. Because the rate only ever goes UP, that anchor
    ///    stays at or after `startTime` and cannot underflow.
    ///
    ///  - **Scheduled** (active but not yet started): additive — the deposit
    ///    grows and the rate/start are untouched, so the extra funds simply
    ///    extend the runway past the original end. Re-anchoring here would break
    ///    the schedule, so we deliberately don't touch the rate before a stream
    ///    has begun.
    ///
    ///  - **Drained/inactive**: reactivates and restarts the accrual clock from
    ///    now, so the idle gap is never retroactively owed (unchanged behaviour).
    function topUp(uint256 streamId, uint128 amount) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.employer, "not employer");
        require(amount > 0, "amount must be > 0");
        require(!_cancellationOpen(streamId), "cancellation pending");

        usdc.transferFrom(msg.sender, address(this), amount);

        uint64 nowT = uint64(block.timestamp);

        if (s.active && nowT > s.startTime) {
            // ---- Running stream: preserve finish time, raise the rate --------
            uint128 owed = _accrued(s); // already streamed, not yet claimed (≤ deposit)
            uint128 unstreamed = s.deposit - owed; // future money, before this top-up

            // Runway (seconds) left at the current rate — same formula as runway().
            uint256 remainingRunway = s.ratePerSecond > 0 ? uint256(unstreamed) / s.ratePerSecond : 0;

            uint128 newRate;
            if (remainingRunway > 0) {
                // Spread (unstreamed + amount) across the SAME remaining seconds.
                // Since amount > 0 this is strictly greater than the old rate.
                uint256 r = (uint256(unstreamed) + amount) / remainingRunway;
                newRate = r > type(uint128).max ? type(uint128).max : uint128(r);
                if (newRate == 0) newRate = s.ratePerSecond; // defensive; can't hit
            } else {
                // No runway to preserve (sub-second remainder, or fully accrued
                // and awaiting a claim): keep the rate; the new funds add runway.
                newRate = s.ratePerSecond;
            }

            s.deposit += amount;
            s.totalDeposited += amount;
            s.ratePerSecond = newRate;

            // Re-anchor the accrual clock so the already-owed amount is unchanged
            // under the new rate. `backdate = owed / newRate` seconds of the new
            // rate reproduce `owed` (± sub-second dust in the employer's favour).
            // backdate ≤ (now - oldLastClaimTime) because newRate ≥ oldRate, so
            // this never underflows and never predates startTime.
            uint256 backdate = uint256(owed) / newRate;
            s.lastClaimTime = nowT - uint64(backdate);
        } else {
            // ---- Scheduled, or drained/inactive: simple additive top-up ------
            s.deposit += amount;
            s.totalDeposited += amount;

            // Reactivating a drained stream restarts its accrual clock from now,
            // so the gap while it sat empty is never retroactively owed.
            if (!s.active && s.deposit >= s.ratePerSecond) {
                s.active = true;
                s.lastClaimTime = nowT;
            }
        }

        emit StreamToppedUp(streamId, msg.sender, amount);
    }

    /// @notice Payer requests cancellation. Accrued USDC is paid immediately,
    /// while the unstreamed remainder stays escrowed for the payee's 24-hour
    /// appeal window.
    function requestCancellation(uint256 streamId, string calldata reason) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.employer, "not employer");
        require(s.active, "already inactive");
        require(!_cancellationOpen(streamId), "cancellation pending");
        require(bytes(reason).length >= 20, "reason too short");
        require(bytes(reason).length <= 1000, "reason too long");

        uint128 owed = _accrued(s);
        uint128 refund = s.deposit - owed;
        require(refund > 0, "nothing unstreamed to cancel");

        // Settle everything earned up to the cancellation request. The remaining
        // deposit is deliberately retained by this contract until the appeal
        // lifecycle reaches a terminal outcome.
        s.withdrawn += owed;
        s.lastClaimTime = uint64(block.timestamp);
        s.active = false;
        s.deposit = refund;

        if (owed > 0) usdc.transfer(s.employee, owed);

        _openCancellation(streamId, owed, refund, reason);
    }

    /// @notice Payee files an evidence commitment during the 24-hour appeal
    /// window. The URI must resolve to the same bytes committed by evidenceHash
    /// when GenLayer validators adjudicate the case.
    function appealCancellation(uint256 streamId, string calldata evidenceUri, bytes32 evidenceHash) external {
        Stream storage s = streams[streamId];
        Cancellation storage c = cancellations[streamId];
        require(msg.sender == s.employee, "not employee");
        require(c.status == CancellationStatus.AppealWindow, "not appealable");
        require(block.timestamp <= c.appealDeadline, "appeal window closed");
        require(bytes(evidenceUri).length >= 8, "evidence uri too short");
        require(bytes(evidenceUri).length <= 500, "evidence uri too long");
        require(evidenceHash != bytes32(0), "invalid evidence hash");

        c.status = CancellationStatus.Appealed;
        c.evidenceHash = evidenceHash;
        c.evidenceUri = evidenceUri;
        c.adjudicationDeadline = uint64(block.timestamp) + ADJUDICATION_TIMEOUT;

        emit CancellationAppealed(
            streamId,
            c.nonce,
            msg.sender,
            cancellationCaseId(streamId),
            evidenceHash,
            evidenceUri,
            c.adjudicationDeadline
        );
    }

    /// @notice Relays a finalized GenLayer verdict into the Arc escrow.
    /// The configured adjudicator may only choose between the two pre-defined
    /// outcomes; it cannot change balances, parties, rates, or stream terms.
    function resolveCancellation(uint256 streamId, bool appealUpheld, bytes32 verdictHash) external nonReentrant {
        require(msg.sender == adjudicator, "not adjudicator");
        require(verdictHash != bytes32(0), "invalid verdict hash");

        Stream storage s = streams[streamId];
        Cancellation storage c = cancellations[streamId];
        require(c.status == CancellationStatus.Appealed, "not adjudicating");
        require(block.timestamp <= c.adjudicationDeadline, "adjudication timed out");

        uint128 refund;
        c.verdictHash = verdictHash;
        if (appealUpheld) {
            c.status = CancellationStatus.AppealUpheld;
            s.active = true;
            uint64 now_ = uint64(block.timestamp);
            s.lastClaimTime = s.startTime > now_ ? s.startTime : now_;
        } else {
            c.status = CancellationStatus.AppealRejected;
            refund = _releaseCancellationRefund(s, c);
        }

        emit CancellationResolved(streamId, c.nonce, cancellationCaseId(streamId), appealUpheld, refund, verdictHash);
    }

    /// @notice Anyone may refund an unappealed cancellation after 24 hours.
    function finalizeUnappealedCancellation(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        Cancellation storage c = cancellations[streamId];
        require(c.status == CancellationStatus.AppealWindow, "not awaiting appeal");
        require(block.timestamp > c.appealDeadline, "appeal window open");

        c.status = CancellationStatus.Unappealed;
        uint128 refund = _releaseCancellationRefund(s, c);
        emit CancellationFinalized(streamId, c.nonce, c.status, refund);
    }

    /// @notice Prevents a failed relay or unavailable adjudicator from locking
    /// payer funds forever. Anyone may refund after the bounded verdict timeout.
    function finalizeTimedOutAppeal(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        Cancellation storage c = cancellations[streamId];
        require(c.status == CancellationStatus.Appealed, "not adjudicating");
        require(block.timestamp > c.adjudicationDeadline, "adjudication active");

        c.status = CancellationStatus.TimedOut;
        uint128 refund = _releaseCancellationRefund(s, c);
        emit CancellationFinalized(streamId, c.nonce, c.status, refund);
    }

    /// @notice Deterministic cross-chain case key used by both Arc and the
    /// GenLayer intelligent contract. The nonce prevents replay if a resumed
    /// stream is cancelled again later.
    function cancellationCaseId(uint256 streamId) public view returns (bytes32) {
        Cancellation storage c = cancellations[streamId];
        return keccak256(abi.encode(block.chainid, address(this), streamId, c.nonce));
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

    function _cancellationOpen(uint256 streamId) internal view returns (bool) {
        CancellationStatus status = cancellations[streamId].status;
        return status == CancellationStatus.AppealWindow || status == CancellationStatus.Appealed;
    }

    function _openCancellation(uint256 streamId, uint128 accruedPaid, uint128 escrowedRefund, string calldata reason)
        internal
    {
        uint64 nonce = ++cancellationNonces[streamId];
        uint64 requestedAt = uint64(block.timestamp);
        uint64 appealDeadline = requestedAt + APPEAL_WINDOW;
        cancellations[streamId] = Cancellation({
            nonce: nonce,
            requestedAt: requestedAt,
            appealDeadline: appealDeadline,
            adjudicationDeadline: 0,
            escrowedRefund: escrowedRefund,
            status: CancellationStatus.AppealWindow,
            evidenceHash: bytes32(0),
            verdictHash: bytes32(0),
            reason: reason,
            evidenceUri: ""
        });

        emit CancellationRequested(
            streamId,
            nonce,
            msg.sender,
            accruedPaid,
            escrowedRefund,
            appealDeadline,
            cancellationCaseId(streamId),
            reason
        );
    }

    function _releaseCancellationRefund(Stream storage s, Cancellation storage c) internal returns (uint128 refund) {
        refund = c.escrowedRefund;
        c.escrowedRefund = 0;
        s.deposit = 0;
        if (refund > 0) usdc.transfer(s.employer, refund);
    }

    // ---- Stream requests + negotiation ----------------------------------

    /// @notice Payee asks a payer to open a stream on given terms. No funds move
    ///         yet; the payer funds it on accept, or escrows a counter-offer.
    /// @param payer Who is being asked to fund the stream.
    /// @param ratePerSecond Proposed USDC/sec (6 decimals).
    /// @param deposit Proposed initial deposit.
    /// @param invoiceRef Arbitrary invoice/tax reference.
    /// @param startAt Requested start time (0 = start when accepted).
    function requestStream(
        address payer,
        uint128 ratePerSecond,
        uint128 deposit,
        string calldata invoiceRef,
        uint64 startAt
    ) external returns (uint256 requestId) {
        require(payer != address(0), "invalid payer");
        require(payer != msg.sender, "cannot request from self");
        _validateTerms(msg.sender, ratePerSecond, deposit);

        requestId = nextRequestId++;
        requests[requestId] = StreamRequest({
            payee: msg.sender,
            payer: payer,
            ratePerSecond: ratePerSecond,
            deposit: deposit,
            startAt: startAt,
            counterDeadline: 0,
            status: ReqStatus.Pending,
            invoiceRef: invoiceRef,
            streamId: 0
        });

        payeeRequests[msg.sender].push(requestId);
        payerRequests[payer].push(requestId);

        emit RequestCreated(requestId, msg.sender, payer, ratePerSecond, deposit, startAt, invoiceRef);
    }

    /// @notice Payer accepts a pending request as-is: funds and opens the stream.
    ///         Requires prior USDC approval for the request's deposit.
    function acceptRequest(uint256 requestId) external nonReentrant returns (uint256 streamId) {
        StreamRequest storage r = requests[requestId];
        require(msg.sender == r.payer, "not payer");
        require(r.status == ReqStatus.Pending, "not pending");

        r.status = ReqStatus.Accepted;
        usdc.transferFrom(msg.sender, address(this), r.deposit);
        streamId = _openStream(r.payer, r.payee, r.ratePerSecond, r.deposit, r.invoiceRef, r.startAt);
        r.streamId = streamId;

        emit RequestAccepted(requestId, streamId);
    }

    /// @notice Payer counters a pending request with different terms, ESCROWING
    ///         the new deposit immediately. Because funds are pre-committed, the
    ///         payee accepting the counter starts the stream with no further
    ///         payer signature. The offer auto-expires after COUNTER_WINDOW.
    function counterRequest(uint256 requestId, uint128 newRate, uint128 newDeposit, uint64 newStartAt)
        external
        nonReentrant
    {
        StreamRequest storage r = requests[requestId];
        require(msg.sender == r.payer, "not payer");
        require(r.status == ReqStatus.Pending, "not pending");
        _validateTerms(r.payee, newRate, newDeposit);

        r.ratePerSecond = newRate;
        r.deposit = newDeposit;
        r.startAt = newStartAt;
        r.counterDeadline = uint64(block.timestamp) + COUNTER_WINDOW;
        r.status = ReqStatus.Countered;

        usdc.transferFrom(msg.sender, address(this), newDeposit);

        emit RequestCountered(requestId, newRate, newDeposit, newStartAt, r.counterDeadline);
    }

    /// @notice Payee accepts the payer's counter-offer. Funds are already
    ///         escrowed, so the stream opens instantly — no payer action needed.
    function acceptCounter(uint256 requestId) external nonReentrant returns (uint256 streamId) {
        StreamRequest storage r = requests[requestId];
        require(msg.sender == r.payee, "not payee");
        require(r.status == ReqStatus.Countered, "no counter");
        require(block.timestamp <= r.counterDeadline, "counter expired");

        r.status = ReqStatus.Accepted;
        streamId = _openStream(r.payer, r.payee, r.ratePerSecond, r.deposit, r.invoiceRef, r.startAt);
        r.streamId = streamId;

        emit RequestAccepted(requestId, streamId);
    }

    /// @notice Payee rejects the payer's counter-offer; escrow is refunded to the payer.
    function rejectCounter(uint256 requestId) external nonReentrant {
        StreamRequest storage r = requests[requestId];
        require(msg.sender == r.payee, "not payee");
        require(r.status == ReqStatus.Countered, "no counter");

        uint128 refund = r.deposit;
        r.status = ReqStatus.Rejected;
        r.deposit = 0;

        if (refund > 0) usdc.transfer(r.payer, refund);

        emit RequestRejected(requestId, msg.sender);
    }

    /// @notice Anyone may settle an expired counter-offer after its window lapses,
    ///         refunding the escrow to the payer. Permissionless because a contract
    ///         cannot self-trigger the refund when the deadline passes.
    function reclaimExpiredCounter(uint256 requestId) external nonReentrant {
        StreamRequest storage r = requests[requestId];
        require(r.status == ReqStatus.Countered, "no counter");
        require(block.timestamp > r.counterDeadline, "not expired");

        uint128 refund = r.deposit;
        r.status = ReqStatus.Expired;
        r.deposit = 0;

        if (refund > 0) usdc.transfer(r.payer, refund);

        emit RequestExpired(requestId, refund);
    }

    /// @notice Payer declines a pending request outright. No funds were moved.
    function rejectRequest(uint256 requestId) external {
        StreamRequest storage r = requests[requestId];
        require(msg.sender == r.payer, "not payer");
        require(r.status == ReqStatus.Pending, "not pending");

        r.status = ReqStatus.Rejected;
        emit RequestRejected(requestId, msg.sender);
    }

    /// @notice Payee cancels their own request while it's still pending.
    function cancelRequest(uint256 requestId) external {
        StreamRequest storage r = requests[requestId];
        require(msg.sender == r.payee, "not payee");
        require(r.status == ReqStatus.Pending, "not pending");

        r.status = ReqStatus.Cancelled;
        emit RequestCancelled(requestId, msg.sender);
    }

    function getPayerRequests(address payer) external view returns (uint256[] memory) {
        return payerRequests[payer];
    }

    function getPayeeRequests(address payee) external view returns (uint256[] memory) {
        return payeeRequests[payee];
    }

    function _accrued(Stream storage s) internal view returns (uint128) {
        if (!s.active) return 0;
        // Scheduled stream that hasn't begun yet — nothing has accrued, and
        // subtracting a future lastClaimTime would underflow.
        if (block.timestamp <= s.lastClaimTime) return 0;
        uint64 elapsed = uint64(block.timestamp) - s.lastClaimTime;
        uint128 owed = uint128(elapsed) * s.ratePerSecond;
        return owed > s.deposit ? s.deposit : owed;
    }
}
