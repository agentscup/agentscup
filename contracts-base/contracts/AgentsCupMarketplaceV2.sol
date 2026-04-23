// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  AgentsCupMarketplaceV2 (CUP-native)
 * @notice Peer-to-peer agent trading paid in $CUP on Base. Successor to
 *         the original ETH-based `AgentsCupMarketplace`.
 *
 *         The protocol keeps its event-driven ownership-swap model:
 *         backend listens for {AgentSold} events, then transfers the
 *         DB agent row to the buyer. Listings remain off-chain rows
 *         keyed by a backend-chosen `listingId`; this contract is the
 *         payment rail.
 *
 * @dev    Buyer flow:
 *           1. `cup.approve(marketplace, price)` (or EIP-2612 permit).
 *           2. `buyAgent(listingId)` — contract pulls `price` CUP from
 *              the buyer, splits protocol fee (basis points) to the
 *              treasury, forwards the remainder to the seller.
 *
 *         Sellers pay no CUP up front to list — listing is metadata only.
 */
contract AgentsCupMarketplaceV2 is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    /// @dev 10_000 = 100%.
    uint16 public constant FEE_DENOMINATOR = 10_000;
    /// @dev Hard cap on the protocol fee (5%). Admin cannot exceed this.
    uint16 public constant MAX_FEE_BPS = 500;

    IERC20 public immutable cup;
    uint16 public feeBps;
    address public treasury;

    struct Listing {
        address seller;
        uint256 price;   // in CUP wei
        uint64 expiresAt;
        bool active;
    }

    /// @notice Listing state keyed by a backend-chosen listingId (bytes32).
    mapping(bytes32 => Listing) public listings;

    event AgentListed(
        bytes32 indexed listingId,
        address indexed seller,
        bytes32 indexed agentId,
        uint256 price,
        uint64 expiresAt
    );
    event AgentSold(
        bytes32 indexed listingId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 fee
    );
    event ListingCancelled(bytes32 indexed listingId, address indexed seller);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeUpdated(uint16 oldBps, uint16 newBps);

    constructor(address cup_, address treasury_, uint16 feeBps_, address admin) {
        require(cup_ != address(0), "cup=0");
        require(treasury_ != address(0), "treasury=0");
        require(admin != address(0), "admin=0");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");

        cup = IERC20(cup_);
        treasury = treasury_;
        feeBps = feeBps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice List an agent for sale at `price` CUP.
     * @param listingId  Backend-chosen id. Must be unique (revert if reused).
     * @param agentId    Backend agent identifier (hashed/derived).
     * @param price      Sale price in CUP wei (18 decimals).
     * @param ttlSeconds How long the listing stays active, in seconds.
     */
    function listAgent(
        bytes32 listingId,
        bytes32 agentId,
        uint256 price,
        uint32 ttlSeconds
    ) external nonReentrant whenNotPaused {
        require(price > 0, "price=0");
        require(ttlSeconds > 0, "ttl=0");
        Listing storage l = listings[listingId];
        require(l.seller == address(0), "id reused");

        uint64 expiresAt = uint64(block.timestamp + ttlSeconds);
        listings[listingId] = Listing({
            seller: msg.sender,
            price: price,
            expiresAt: expiresAt,
            active: true
        });

        emit AgentListed(listingId, msg.sender, agentId, price, expiresAt);
    }

    /**
     * @notice Buy a listing by paying `price` CUP. Fee is skimmed to
     *         treasury, remainder forwarded to seller. Both transfers
     *         pull from the buyer's wallet — no contract-side float.
     */
    function buyAgent(bytes32 listingId)
        external
        nonReentrant
        whenNotPaused
    {
        Listing storage l = listings[listingId];
        require(l.active, "not active");
        require(block.timestamp <= l.expiresAt, "expired");
        require(msg.sender != l.seller, "self-buy");

        address seller = l.seller;
        uint256 price = l.price;
        l.active = false;

        uint256 fee = (price * feeBps) / FEE_DENOMINATOR;
        uint256 payout = price - fee;

        if (fee > 0) {
            cup.safeTransferFrom(msg.sender, treasury, fee);
        }
        cup.safeTransferFrom(msg.sender, seller, payout);

        emit AgentSold(listingId, seller, msg.sender, price, fee);
    }

    /**
     * @notice Cancel your own listing while still active. Sets active=false;
     *         the backend reflects the unlisting off-chain.
     */
    function cancelListing(bytes32 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        require(l.active, "not active");
        require(l.seller == msg.sender, "not seller");
        l.active = false;
        emit ListingCancelled(listingId, msg.sender);
    }

    // ── Admin ──────────────────────────────────────────────────────────

    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        require(newTreasury != address(0), "treasury=0");
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setFeeBps(uint16 newFeeBps) external onlyRole(ADMIN_ROLE) {
        require(newFeeBps <= MAX_FEE_BPS, "fee too high");
        uint16 old = feeBps;
        feeBps = newFeeBps;
        emit FeeUpdated(old, newFeeBps);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
