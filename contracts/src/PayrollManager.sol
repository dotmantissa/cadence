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
    event StreamCancelled(uint256 indexed streamId, address indexed employer, uint128 refunded);

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
        uint256 indexed requestId,
        uint128 ratePerSecond,
        uint128 deposit,
        uint64 startAt,
        uint64 counterDeadline
    );
    event RequestAccepted(uint256 indexed requestId, uint256 indexed streamId);
    event RequestRejected(uint256 indexed requestId, address indexed by);
    event RequestCancelled(uint256 indexed requestId, address indexed by);
    event RequestExpired(uint256 indexed requestId, uint128 refunded);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
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
    function topUp(uint256 streamId, uint128 amount) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.employer, "not employer");
        require(amount > 0, "amount must be > 0");

        usdc.transferFrom(msg.sender, address(this), amount);
        s.deposit += amount;
        s.totalDeposited += amount;

        // Reactivating a drained stream restarts its accrual clock from now, so
        // the gap while it sat empty is never retroactively owed.
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

        // Record the final payout so cumulative accounting (withdrawn / streamed)
        // stays exact after a cancel, and advance the claim clock to match.
        s.withdrawn += owed;
        s.lastClaimTime = uint64(block.timestamp);
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
    function counterRequest(
        uint256 requestId,
        uint128 newRate,
        uint128 newDeposit,
        uint64 newStartAt
    ) external nonReentrant {
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
