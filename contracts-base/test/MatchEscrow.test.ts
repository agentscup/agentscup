import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Unit tests for AgentsCupMatchEscrow. Covers deposits, winner payout,
 * draw refunds, forfeit drain, entry-fee mismatch, slot reuse, and
 * access control on the settlement functions.
 */
describe("AgentsCupMatchEscrow", () => {
  const ENTRY_FEE = ethers.parseEther("0.001");

  async function deployFixture() {
    const [admin, alice, bob, carol] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AgentsCupMatchEscrow");
    const escrow = await Factory.deploy(admin.address);
    await escrow.waitForDeployment();

    return { escrow, admin, alice, bob, carol };
  }

  function matchId(s: string) {
    return ethers.id(s);
  }

  it("accepts a correctly-sized deposit and records the slot", async () => {
    const { escrow, alice } = await loadFixture(deployFixture);
    const mid = matchId("m-1");

    await expect(
      escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE })
    ).to.emit(escrow, "EntryDeposited");

    const slot = await escrow.slots(mid, 0);
    expect(slot.player).to.equal(alice.address);
    expect(slot.amount).to.equal(ENTRY_FEE);
    expect(slot.status).to.equal(1n); // Funded
  });

  it("rejects wrong-fee deposits", async () => {
    const { escrow, alice } = await loadFixture(deployFixture);
    const mid = matchId("m-2");
    await expect(
      escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE - 1n })
    ).to.be.revertedWith("wrong fee");
    await expect(
      escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE + 1n })
    ).to.be.revertedWith("wrong fee");
  });

  it("rejects reusing a slot", async () => {
    const { escrow, alice, bob } = await loadFixture(deployFixture);
    const mid = matchId("m-3");
    await escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE });
    await expect(
      escrow.connect(bob).depositEntry(mid, 0, { value: ENTRY_FEE })
    ).to.be.revertedWith("slot taken");
  });

  it("pays the full prize pot to the winner", async () => {
    const { escrow, admin, alice, bob } = await loadFixture(deployFixture);
    const mid = matchId("m-4");

    await escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE });
    await escrow.connect(bob).depositEntry(mid, 1, { value: ENTRY_FEE });

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    await expect(escrow.connect(admin).payoutWinner(mid, 0))
      .to.emit(escrow, "WinnerPaid")
      .withArgs(mid, alice.address, ENTRY_FEE * 2n);
    const aliceAfter = await ethers.provider.getBalance(alice.address);

    expect(aliceAfter - aliceBefore).to.equal(ENTRY_FEE * 2n);

    // Slots marked settled
    expect((await escrow.slots(mid, 0)).status).to.equal(2n);
    expect((await escrow.slots(mid, 1)).status).to.equal(2n);
  });

  it("refunds each player on a draw", async () => {
    const { escrow, admin, alice, bob } = await loadFixture(deployFixture);
    const mid = matchId("m-5");
    await escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE });
    await escrow.connect(bob).depositEntry(mid, 1, { value: ENTRY_FEE });

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);

    await expect(escrow.connect(admin).refundDraw(mid))
      .to.emit(escrow, "DrawRefunded");

    expect((await ethers.provider.getBalance(alice.address)) - aliceBefore).to.equal(ENTRY_FEE);
    expect((await ethers.provider.getBalance(bob.address)) - bobBefore).to.equal(ENTRY_FEE);
  });

  it("blocks non-operator from settling", async () => {
    const { escrow, alice, bob, carol } = await loadFixture(deployFixture);
    const mid = matchId("m-6");
    await escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE });
    await escrow.connect(bob).depositEntry(mid, 1, { value: ENTRY_FEE });

    await expect(escrow.connect(carol).payoutWinner(mid, 0)).to.be.reverted;
    await expect(escrow.connect(carol).refundDraw(mid)).to.be.reverted;
  });

  it("lets operator forfeit a partially-funded match to a beneficiary", async () => {
    const { escrow, admin, alice, carol } = await loadFixture(deployFixture);
    const mid = matchId("m-7");
    await escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE });

    const carolBefore = await ethers.provider.getBalance(carol.address);
    await expect(escrow.connect(admin).forfeitAll(mid, carol.address))
      .to.emit(escrow, "MatchForfeited")
      .withArgs(mid, carol.address, ENTRY_FEE);
    const carolAfter = await ethers.provider.getBalance(carol.address);

    expect(carolAfter - carolBefore).to.equal(ENTRY_FEE);
  });

  it("lets admin change the entry fee", async () => {
    const { escrow, admin, alice } = await loadFixture(deployFixture);
    const newFee = ethers.parseEther("0.002");
    await expect(escrow.connect(admin).setEntryFee(newFee))
      .to.emit(escrow, "EntryFeeUpdated")
      .withArgs(ENTRY_FEE, newFee);

    // Old fee amount now rejected
    await expect(
      escrow.connect(alice).depositEntry(matchId("m-8"), 0, { value: ENTRY_FEE })
    ).to.be.revertedWith("wrong fee");

    // New fee accepted
    await expect(
      escrow.connect(alice).depositEntry(matchId("m-9"), 0, { value: newFee })
    ).to.emit(escrow, "EntryDeposited");
  });

  it("rejects settlement when a slot is not funded", async () => {
    const { escrow, admin, alice } = await loadFixture(deployFixture);
    const mid = matchId("m-10");
    await escrow.connect(alice).depositEntry(mid, 0, { value: ENTRY_FEE });

    await expect(escrow.connect(admin).payoutWinner(mid, 0)).to.be.revertedWith("loser not funded");
    await expect(escrow.connect(admin).refundDraw(mid)).to.be.revertedWith("not funded");
  });

  it("blocks deposits while paused", async () => {
    const { escrow, admin, alice } = await loadFixture(deployFixture);
    await escrow.connect(admin).pause();
    await expect(
      escrow.connect(alice).depositEntry(matchId("m-11"), 0, { value: ENTRY_FEE })
    ).to.be.reverted;

    await escrow.connect(admin).unpause();
    await expect(
      escrow.connect(alice).depositEntry(matchId("m-12"), 0, { value: ENTRY_FEE })
    ).to.emit(escrow, "EntryDeposited");
  });
});
