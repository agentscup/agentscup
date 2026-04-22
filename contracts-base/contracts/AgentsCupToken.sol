// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title  Agents Cup Token (CUP)
 * @notice Fixed-supply ERC-20 for the Agents Cup platform on Base.
 *         1,000,000,000 CUP minted to the treasury at deploy time.
 *
 *         No mint, no burn, no admin role — the token contract is
 *         intentionally simple and permissionless after deployment.
 *         Supply can never change; treasury transfers freely. EIP-2612
 *         permit support lets users approve via signature so claim /
 *         swap flows avoid an extra approve tx.
 */
contract AgentsCupToken is ERC20, ERC20Permit {
    constructor(address treasury)
        ERC20("Agents Cup", "CUP")
        ERC20Permit("Agents Cup")
    {
        require(treasury != address(0), "treasury=0");
        _mint(treasury, 1_000_000_000 * 10 ** 18);
    }
}
