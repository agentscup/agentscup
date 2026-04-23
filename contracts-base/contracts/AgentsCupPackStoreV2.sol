// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  AgentsCupPackStoreV2 (CUP-native)
 * @notice Accepts $CUP (ERC-20) for pack purchases and forwards to the
 *         treasury. Successor to the original ETH-based `AgentsCupPackStore`.
 *
 * @dev    Buyer must first `approve(packStore, price)` on the CUP token
 *         contract (or use `permit()` signature — CUP is ERC20Permit).
 *         This contract then pulls the amount via `transferFrom` and
 *         forwards it to the treasury in the same tx, so the store
 *         never holds a CUP balance (same zero-custody property as
 *         the ETH version).
 *
 *         Tier prices are stored on-chain so the frontend can read
 *         them with a single `packPrices(tier)` call, avoiding a
 *         backend round-trip before the approve. They're still
 *         admin-tunable.
 */
contract AgentsCupPackStoreV2 is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable cup;
    address public treasury;

    /// @notice Price in CUP (18-decimal wei) keyed by tier id.
    mapping(uint8 => uint256) public packPrices;

    event PackPurchased(
        address indexed buyer,
        uint8 indexed packTier,
        uint256 amount,
        bytes32 indexed requestId
    );

    event PackPriceUpdated(uint8 indexed packTier, uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    constructor(
        address cup_,
        address treasury_,
        address admin,
        uint8[] memory tiers,
        uint256[] memory prices
    ) {
        require(cup_ != address(0), "cup=0");
        require(treasury_ != address(0), "treasury=0");
        require(admin != address(0), "admin=0");
        require(tiers.length == prices.length, "len mismatch");

        cup = IERC20(cup_);
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        // Seed the pack price table.
        for (uint256 i = 0; i < tiers.length; i++) {
            packPrices[tiers[i]] = prices[i];
            emit PackPriceUpdated(tiers[i], 0, prices[i]);
        }
    }

    /**
     * @notice Buy a pack by transferring the tier's CUP price from the
     *         caller's wallet to the treasury.
     *
     * @param packTier   0-based tier id. Must have a non-zero configured price.
     * @param requestId  Client-generated unique id. Used by the backend
     *                   as an idempotency key to dedupe replays.
     */
    function buyPack(uint8 packTier, bytes32 requestId)
        external
        nonReentrant
        whenNotPaused
    {
        uint256 price = packPrices[packTier];
        require(price > 0, "tier not configured");

        cup.safeTransferFrom(msg.sender, treasury, price);
        emit PackPurchased(msg.sender, packTier, price, requestId);
    }

    // ── Admin ──────────────────────────────────────────────────────────

    function setPackPrice(uint8 packTier, uint256 newPrice)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        uint256 old = packPrices[packTier];
        packPrices[packTier] = newPrice;
        emit PackPriceUpdated(packTier, old, newPrice);
    }

    function setTreasury(address newTreasury)
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
