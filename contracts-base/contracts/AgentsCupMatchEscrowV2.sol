// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  AgentsCupMatchEscrowV2 (CUP-native)
 * @notice Holds each player's match entry fee in $CUP while a match runs.
 *         Successor to the ETH-based `AgentsCupMatchEscrow`.
 *
 * @dev    Flow mirrors the ETH version exactly — only the asset changes:
 *           1. Player `approve(escrow, entryFee)` + `depositEntry(matchId, slot)`.
 *              The contract pulls `entryFee` CUP into custody.
 *           2. Socket server pairs players and streams the simulation.
 *           3. Backend (OPERATOR_ROLE) settles:
 *                - {payoutWinner} → winner collects 2 × entryFee in CUP.
 *                - {refundDraw}   → each player gets their entry back.
 *                - {forfeitAll}   → emergency drain of any funded slot to
 *                                   a designated beneficiary.
 *
 *         The escrow IS custodial for pending CUP — so the state machine
 *         enforces that each slot transitions Funded → Settled exactly
 *         once, preventing double-payout.
 */
contract AgentsCupMatchEscrowV2 is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum SlotStatus { None, Funded, Settled }

    struct Slot {
        address player;
        uint256 amount;
        SlotStatus status;
    }

    IERC20 public immutable cup;

    /// @notice Per-match deposit bucket keyed by backend-generated matchId.
    ///         Both players deposit under the same matchId but different slots (0 or 1).
    mapping(bytes32 => mapping(uint8 => Slot)) public slots;

    /// @notice Fixed entry fee required per deposit, denominated in CUP wei.
    uint256 public entryFee;

    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event EntryDeposited(
        bytes32 indexed matchId,
        uint8 indexed slot,
        address indexed player,
        uint256 amount
    );
    event WinnerPaid(bytes32 indexed matchId, address indexed winner, uint256 amount);
    event DrawRefunded(bytes32 indexed matchId, address indexed playerA, address indexed playerB);
    event MatchForfeited(bytes32 indexed matchId, address indexed beneficiary, uint256 amount);

    constructor(address cup_, address admin, uint256 initialEntryFee) {
        require(cup_ != address(0), "cup=0");
        require(admin != address(0), "admin=0");
        require(initialEntryFee > 0, "fee=0");

        cup = IERC20(cup_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        entryFee = initialEntryFee;
    }

    // ── Player actions ─────────────────────────────────────────────────

    /**
     * @notice Deposit the entry fee for `matchId` under `slot` (0 or 1).
     *         Pulls `entryFee` CUP from the caller — caller must have
     *         approved the escrow beforehand.
     */
    function depositEntry(bytes32 matchId, uint8 slot)
        external
        nonReentrant
        whenNotPaused
    {
        require(slot < 2, "slot>1");
        Slot storage s = slots[matchId][slot];
        require(s.status == SlotStatus.None, "slot taken");

        uint256 amount = entryFee;
        s.player = msg.sender;
        s.amount = amount;
        s.status = SlotStatus.Funded;

        cup.safeTransferFrom(msg.sender, address(this), amount);
        emit EntryDeposited(matchId, slot, msg.sender, amount);
    }

    // ── Backend settlement ─────────────────────────────────────────────

    /**
     * @notice Pay the full prize pot (both entry fees) to the winner.
     */
    function payoutWinner(bytes32 matchId, uint8 winningSlot)
        external
        nonReentrant
        onlyRole(OPERATOR_ROLE)
    {
        require(winningSlot < 2, "slot>1");
        Slot storage winner = slots[matchId][winningSlot];
        Slot storage loser = slots[matchId][1 - winningSlot];
        require(winner.status == SlotStatus.Funded, "winner not funded");
        require(loser.status == SlotStatus.Funded, "loser not funded");

        uint256 pot = winner.amount + loser.amount;
        address winnerAddr = winner.player;
        winner.status = SlotStatus.Settled;
        loser.status = SlotStatus.Settled;

        cup.safeTransfer(winnerAddr, pot);
        emit WinnerPaid(matchId, winnerAddr, pot);
    }

    /**
     * @notice Refund both players their own entry (draw outcome).
     */
    function refundDraw(bytes32 matchId)
        external
        nonReentrant
        onlyRole(OPERATOR_ROLE)
    {
        Slot storage a = slots[matchId][0];
        Slot storage b = slots[matchId][1];
        require(
            a.status == SlotStatus.Funded && b.status == SlotStatus.Funded,
            "not funded"
        );

        uint256 amountA = a.amount;
        uint256 amountB = b.amount;
        address playerA = a.player;
        address playerB = b.player;
        a.status = SlotStatus.Settled;
        b.status = SlotStatus.Settled;

        cup.safeTransfer(playerA, amountA);
        cup.safeTransfer(playerB, amountB);
        emit DrawRefunded(matchId, playerA, playerB);
    }

    /**
     * @notice Emergency drain for a match — sends every still-funded slot's
     *         deposit to `beneficiary`. Intended for stall recovery where
     *         only one player deposited, or an outcome never settled.
     */
    function forfeitAll(bytes32 matchId, address beneficiary)
        external
        nonReentrant
        onlyRole(OPERATOR_ROLE)
    {
        require(beneficiary != address(0), "beneficiary=0");
        Slot storage a = slots[matchId][0];
        Slot storage b = slots[matchId][1];

        uint256 pot;
        if (a.status == SlotStatus.Funded) {
            pot += a.amount;
            a.status = SlotStatus.Settled;
        }
        if (b.status == SlotStatus.Funded) {
            pot += b.amount;
            b.status = SlotStatus.Settled;
        }
        require(pot > 0, "nothing to forfeit");

        cup.safeTransfer(beneficiary, pot);
        emit MatchForfeited(matchId, beneficiary, pot);
    }

    // ── Admin ──────────────────────────────────────────────────────────

    function setEntryFee(uint256 newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFee > 0, "fee=0");
        uint256 old = entryFee;
        entryFee = newFee;
        emit EntryFeeUpdated(old, newFee);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
