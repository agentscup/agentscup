// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface ICupMerkleDistributor {
    function claim(address account, uint256 amount, bytes32[] calldata proof) external;
    function claimed(address account) external view returns (bool);
}

/**
 * @title  CupClaimRouter
 * @notice Single-tx claim wrapper for the $CUP airdrop. Routes a
 *         combined claim across both distributors (Main 220M + EA Bonus
 *         80M) and charges a small fixed fee that goes to treasury.
 *
 *         The underlying distributors' `claim(account, amount, proof)`
 *         transfers tokens to `account` regardless of who submits the
 *         tx, so this router can claim on behalf of `msg.sender`.
 */
contract CupClaimRouter is Ownable {
    using Address for address payable;

    ICupMerkleDistributor public immutable mainDistributor;
    ICupMerkleDistributor public immutable bonusDistributor;
    address payable public treasury;
    uint256 public claimFeeWei; // fixed ETH fee per claim — owner updates as ETH/USD moves

    event Claimed(
        address indexed user,
        uint256 mainAmount,
        uint256 bonusAmount,
        uint256 feePaidWei
    );
    event FeeUpdated(uint256 oldFeeWei, uint256 newFeeWei);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    error FeeTooLow();
    error NothingToClaim();

    constructor(
        address mainDistributor_,
        address bonusDistributor_,
        address payable treasury_,
        uint256 initialFeeWei,
        address owner_
    ) Ownable(owner_) {
        mainDistributor = ICupMerkleDistributor(mainDistributor_);
        bonusDistributor = ICupMerkleDistributor(bonusDistributor_);
        treasury = treasury_;
        claimFeeWei = initialFeeWei;
    }

    /// @notice Combined claim. Pass amount=0 and empty proof to skip
    ///         either distributor (e.g., EA bonus not applicable).
    function claim(
        uint256 mainAmount,
        bytes32[] calldata mainProof,
        uint256 bonusAmount,
        bytes32[] calldata bonusProof
    ) external payable {
        if (msg.value < claimFeeWei) revert FeeTooLow();
        if (mainAmount == 0 && bonusAmount == 0) revert NothingToClaim();

        // Forward fee to treasury. Any excess ETH also routes to
        // treasury rather than getting stuck in the router — simpler
        // than a refund loop.
        treasury.sendValue(msg.value);

        if (mainAmount > 0) {
            mainDistributor.claim(msg.sender, mainAmount, mainProof);
        }
        if (bonusAmount > 0) {
            bonusDistributor.claim(msg.sender, bonusAmount, bonusProof);
        }

        emit Claimed(msg.sender, mainAmount, bonusAmount, msg.value);
    }

    /// @notice Returns whether the caller has already claimed each pool.
    function claimStatus(address user)
        external
        view
        returns (bool mainClaimed, bool bonusClaimed)
    {
        mainClaimed = mainDistributor.claimed(user);
        bonusClaimed = bonusDistributor.claimed(user);
    }

    function setFee(uint256 newFeeWei) external onlyOwner {
        emit FeeUpdated(claimFeeWei, newFeeWei);
        claimFeeWei = newFeeWei;
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }
}
