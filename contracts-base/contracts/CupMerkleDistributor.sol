// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title  CupMerkleDistributor
 * @notice Merkle-based airdrop claim for $CUP. Each eligible wallet is
 *         a leaf in the tree; users submit a proof to claim their
 *         allocation. One claim per wallet.
 *
 * @dev    Leaf hashing follows OpenZeppelin StandardMerkleTree v1:
 *         `leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))))`
 *         The double hash defends against second-preimage attacks when
 *         intermediate nodes accidentally collide with a leaf.
 *
 *         After `claimDeadline`, the owner can `sweep` any unclaimed
 *         tokens (e.g., into treasury for a future round or burn).
 */
contract CupMerkleDistributor is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    uint64 public immutable claimDeadline; // 0 = no deadline

    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);
    event Swept(address indexed to, uint256 amount);

    error AlreadyClaimed();
    error InvalidProof();
    error Expired();
    error NotSweepable();

    constructor(
        IERC20 token_,
        bytes32 merkleRoot_,
        uint64 claimDeadline_,
        address owner_
    ) Ownable(owner_) {
        token = token_;
        merkleRoot = merkleRoot_;
        claimDeadline = claimDeadline_;
    }

    /// @notice Claim `amount` CUP for `account` using the Merkle `proof`.
    /// @dev    Anyone may submit the claim on behalf of `account` — the
    ///         tokens always go to `account`, so a relayer pattern is
    ///         safe.
    function claim(
        address account,
        uint256 amount,
        bytes32[] calldata proof
    ) external {
        if (claimDeadline != 0 && block.timestamp > claimDeadline) revert Expired();
        if (claimed[account]) revert AlreadyClaimed();

        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(account, amount)))
        );
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();

        claimed[account] = true;
        token.safeTransfer(account, amount);
        emit Claimed(account, amount);
    }

    /// @notice Owner sweeps any remaining tokens after `claimDeadline`.
    function sweep(address to) external onlyOwner {
        if (claimDeadline == 0 || block.timestamp <= claimDeadline) revert NotSweepable();
        uint256 bal = token.balanceOf(address(this));
        token.safeTransfer(to, bal);
        emit Swept(to, bal);
    }
}
