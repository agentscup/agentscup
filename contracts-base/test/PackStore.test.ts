import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Unit tests for AgentsCupPackStore. Covers the happy path, input
 * validation, admin actions, and the pause switch.
 */
describe("AgentsCupPackStore", () => {
  async function deployFixture() {
    const [admin, treasury, buyer, stranger] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AgentsCupPackStore");
    const packStore = await Factory.deploy(treasury.address, admin.address);
    await packStore.waitForDeployment();

    return { packStore, admin, treasury, buyer, stranger };
  }

  it("forwards payment to the treasury and emits PackPurchased", async () => {
    const { packStore, treasury, buyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("0.01");
    const requestId = ethers.keccak256(ethers.toUtf8Bytes("req-1"));

    const balanceBefore = await ethers.provider.getBalance(treasury.address);
    const tx = packStore.connect(buyer).buyPack(2, requestId, { value: price });
    await expect(tx)
      .to.emit(packStore, "PackPurchased")
      .withArgs(buyer.address, 2, price, requestId);

    const balanceAfter = await ethers.provider.getBalance(treasury.address);
    expect(balanceAfter - balanceBefore).to.equal(price);
  });

  it("reverts on zero-value purchases", async () => {
    const { packStore, buyer } = await loadFixture(deployFixture);
    const requestId = ethers.ZeroHash;
    await expect(
      packStore.connect(buyer).buyPack(0, requestId, { value: 0 })
    ).to.be.revertedWith("amount=0");
  });

  it("allows admin to pause / unpause", async () => {
    const { packStore, admin, buyer } = await loadFixture(deployFixture);
    await packStore.connect(admin).pause();

    await expect(
      packStore.connect(buyer).buyPack(0, ethers.ZeroHash, { value: 1 })
    ).to.be.reverted;

    await packStore.connect(admin).unpause();
    await expect(
      packStore.connect(buyer).buyPack(0, ethers.id("r2"), { value: 1 })
    ).to.not.be.reverted;
  });

  it("blocks non-admins from updating the treasury", async () => {
    const { packStore, stranger } = await loadFixture(deployFixture);
    await expect(
      packStore.connect(stranger).setTreasury(stranger.address)
    ).to.be.reverted;
  });

  it("lets admin rotate the treasury and emits TreasuryUpdated", async () => {
    const { packStore, admin, treasury, stranger, buyer } = await loadFixture(deployFixture);
    await expect(packStore.connect(admin).setTreasury(stranger.address))
      .to.emit(packStore, "TreasuryUpdated")
      .withArgs(treasury.address, stranger.address);

    const before = await ethers.provider.getBalance(stranger.address);
    await packStore.connect(buyer).buyPack(1, ethers.id("r3"), { value: ethers.parseEther("0.002") });
    const after = await ethers.provider.getBalance(stranger.address);
    expect(after - before).to.equal(ethers.parseEther("0.002"));
  });
});
