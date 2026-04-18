// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  AgentsCupMarketplace (ETH-native)
 * @notice Peer-to-peer agent trading paid in native ETH on Base. Agents
 *         remain off-chain database rows (same as today on Solana) —
 *         this contract is the payment + event rail that lets the
 *         backend settle ownership atomically with buyer payment.
 *
 * @dev    Flow:
 *           1. Seller calls {listAgent} with agentId + price.
 *              The listing goes on-chain; the backend flips
 *              user_agents.is_listed = true off-chain when it sees the
 *              {AgentListed} event.
 *           2. Buyer calls {buyAgent} with msg.value == listing.price.
 *              Contract splits the payment:
 *                - fee to treasury (basis points configurable)
 *                - remainder to seller
 *              Emits {AgentSold}.
 *           3. Backend listens for {AgentSold} and transfers the DB
 *              agent ownership to the buyer.
 *           4. Sellers can {cancelListing} while still active.
 *
 *         Agent IDs are bytes32 to accommodate the existing UUIDs used
 *         by the backend (hashed to bytes32 on the client).
 */
contract AgentsCupMarketplace is AccessControl, ReentrancyGuard, Pausable {
    using Address for address payable;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    /// @dev 10_000 = 100%.
    uint16 public constant FEE_DENOMINATOR = 10_000;
    /// @dev Hard cap on the protocol fee (5%). Admin cannot exceed this.
    uint16 public constant MAX_FEE_BPS = 500;

    uint16 public feeBps;
    address payable public treasury;

    struct Listing {
        address seller;
        uint256 price;
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

    constructor(address payable treasury_, uint16 feeBps_, address admin) {
        require(treasury_ != address(0), "treasury=0");
        require(admin != address(0), "admin=0");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");

        treasury = treasury_;
        feeBps = feeBps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice List an agent for sale at `price` wei.
     * @param listingId  Backend-chosen id. Must be unique (revert if reused).
     * @param agentId    Backend agent identifier (hashed/derived).
     * @param price      Sale price in wei.
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
     * @notice Buy a listing by sending exactly `price` wei. Fee is
     *         skimmed to treasury, remainder forwarded to seller.
     */
    function buyAgent(bytes32 listingId)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        Listing storage l = listings[listingId];
        require(l.active, "not active");
        require(block.timestamp <= l.expiresAt, "expired");
        require(msg.value == l.price, "wrong price");
        require(msg.sender != l.seller, "self-buy");

        l.active = false;

        uint256 fee = (msg.value * feeBps) / FEE_DENOMINATOR;
        uint256 payout = msg.value - fee;

        if (fee > 0) {
            treasury.sendValue(fee);
        }
        payable(l.seller).sendValue(payout);

        emit AgentSold(listingId, l.seller, msg.sender, msg.value, fee);
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

    function setTreasury(address payable newTreasury) external onlyRole(ADMIN_ROLE) {
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
