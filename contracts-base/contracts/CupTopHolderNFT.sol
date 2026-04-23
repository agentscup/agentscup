// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  CupTopHolderNFT
 * @notice Commemorative ERC-1155 for top $CUP holders. Single tokenId
 *         (TOKEN_ID = 1). Owner batch-mints 1 unit per address.
 *
 *         Metadata URI points to a JSON with {name, description, image}.
 *         Owner can `setURI` at any time — useful when the art is
 *         finalized post-deploy.
 */
contract CupTopHolderNFT is ERC1155, Ownable {
    uint256 public constant TOKEN_ID = 1;
    string public name = "Agents Cup Top Holder";
    string public symbol = "CUP-TOP";

    constructor(string memory uri_, address owner_)
        ERC1155(uri_)
        Ownable(owner_)
    {}

    /// @notice Mint 1 NFT per recipient — used for the launch airdrop.
    function airdrop(address[] calldata recipients) external onlyOwner {
        uint256 len = recipients.length;
        for (uint256 i = 0; i < len; ) {
            _mint(recipients[i], TOKEN_ID, 1, "");
            unchecked { ++i; }
        }
    }

    /// @notice Owner can update metadata URI anytime (e.g., after art
    ///         pipeline is finalized).
    function setURI(string calldata newuri) external onlyOwner {
        _setURI(newuri);
    }
}
