// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  AgentsCupMatchEscrow (ETH-native)
 * @notice Holds each player's match entry fee (default 0.001 ETH) while a
 *         match is in progress. The backend (OPERATOR_ROLE) settles the
 *         match by calling {payoutWinner}, {refundDraw}, or {forfeitAll}.
 *
 *         Mirrors the previous Solana $CUP flow exactly — only the
 *         settlement token changes from SPL $CUP to native ETH.
 *
 * @dev    Flow:
 *           1. Player calls {depositEntry} with `msg.value == entryFee`.
 *              Contract records the deposit under (matchId, slot).
 *           2. Socket server pairs players; once both deposits exist, the
 *              match simulation streams as before.
 *           3. When the result lands, backend calls:
 *                - {payoutWinner} → winner collects 2 × entryFee.
 *                - {refundDraw}   → each player gets their own entry back.
 *                - {forfeitAll}   → emergency drain to a designated wallet.
 *
 *         The escrow is purely a payment rail — match outcome is
 *         decided off-chain by the deterministic simulator, and we trust
 *         OPERATOR_ROLE to call the right settlement function.
 */
contract AgentsCupMatchEscrow is AccessControl, ReentrancyGuard, Pausable {
    using Address for address payable;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum SlotStatus { None, Funded, Settled }

    struct Slot {
        address player;
        uint256 amount;
        SlotStatus status;
    }

    /// @notice Per-match deposit bucket keyed by backend-generated matchId.
    ///         Both players deposit under the same matchId but different slots (0 or 1).
    mapping(bytes32 => mapping(uint8 => Slot)) public slots;

    /// @notice Fixed entry fee required per deposit. Admin-tunable so we can
    ///         rebalance without redeploying, seeded to 0.001 ETH.
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

    constructor(address admin) {
        require(admin != address(0), "admin=0");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        entryFee = 0.001 ether;
    }

    // ── Player actions ─────────────────────────────────────────────────

    /**
     * @notice Deposit the entry fee for `matchId` under `slot` (0 or 1).
     *         `msg.value` must equal the current {entryFee}.
     */
    function depositEntry(bytes32 matchId, uint8 slot)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        require(slot < 2, "slot>1");
        require(msg.value == entryFee, "wrong fee");
        Slot storage s = slots[matchId][slot];
        require(s.status == SlotStatus.None, "slot taken");

        s.player = msg.sender;
        s.amount = msg.value;
        s.status = SlotStatus.Funded;

        emit EntryDeposited(matchId, slot, msg.sender, msg.value);
    }

    // ── Backend settlement ─────────────────────────────────────────────

    /**
     * @notice Pay the full prize pot (both entry fees) to the winner.
     *         Called by the backend once the match simulation finishes.
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
        winner.status = SlotStatus.Settled;
        loser.status = SlotStatus.Settled;

        payable(winner.player).sendValue(pot);
        emit WinnerPaid(matchId, winner.player, pot);
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
        a.status = SlotStatus.Settled;
        b.status = SlotStatus.Settled;

        payable(a.player).sendValue(amountA);
        payable(b.player).sendValue(amountB);
        emit DrawRefunded(matchId, a.player, b.player);
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

        payable(beneficiary).sendValue(pot);
        emit MatchForfeited(matchId, beneficiary, pot);
    }

    // ── Admin ──────────────────────────────────────────────────────────

    /**
     * @notice Adjust the per-deposit entry fee. Does NOT retroactively
     *         change already-funded matches.
     */
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
