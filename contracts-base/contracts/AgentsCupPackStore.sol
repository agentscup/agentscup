// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  AgentsCupPackStore (ETH-native)
 * @notice Accepts ETH for pack purchases and forwards funds to the
 *         treasury. The backend listens for {PackPurchased} events and
 *         credits agents off-chain, mirroring the current Solana flow
 *         but paying in native ETH on Base.
 *
 * @dev    Pack prices live in the backend — the frontend attaches the
 *         current price as `msg.value` and the backend verifies the
 *         amount is correct for the given `packTier` before crediting.
 *         Using events + a dedup `requestId` gives us idempotent
 *         server-side credit with one `eth_getLogs` call.
 */
contract AgentsCupPackStore is AccessControl, ReentrancyGuard, Pausable {
    using Address for address payable;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    address payable public treasury;

    event PackPurchased(
        address indexed buyer,
        uint8 indexed packTier,
        uint256 amount,
        bytes32 indexed requestId
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    constructor(address payable treasury_, address admin) {
        require(treasury_ != address(0), "treasury=0");
        require(admin != address(0), "admin=0");

        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @notice Buy a pack by sending ETH. Funds are forwarded to the
     *         treasury in the same tx, so the contract never holds a
     *         balance (reduces attack surface).
     *
     * @param packTier    Frontend-chosen pack tier id (0..255). Validated
     *                    off-chain against the backend's tier table.
     * @param requestId   Client-generated unique id. Used by the backend
     *                    as an idempotency key to dedupe replays.
     */
    function buyPack(uint8 packTier, bytes32 requestId)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        require(msg.value > 0, "amount=0");
        treasury.sendValue(msg.value);
        emit PackPurchased(msg.sender, packTier, msg.value, requestId);
    }

    // ── Admin ──────────────────────────────────────────────────────────

    function setTreasury(address payable newTreasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newTreasury != address(0), "treasury=0");
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
