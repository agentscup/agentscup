import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Unit tests for AgentsCupMarketplace. Covers list → buy → fee split,
 * seller cancel, expiry, wrong-price rejection, and self-buy guard.
 */
describe("AgentsCupMarketplace", () => {
  const FEE_BPS = 250; // 2.5%
  const DAY = 24 * 60 * 60;

  async function deployFixture() {
    const [admin, treasury, seller, buyer, other] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AgentsCupMarketplace");
    const market = await Factory.deploy(treasury.address, FEE_BPS, admin.address);
    await market.waitForDeployment();

    return { market, admin, treasury, seller, buyer, other };
  }

  function id(s: string) {
    return ethers.id(s);
  }

  it("lists an agent and emits AgentListed", async () => {
    const { market, seller } = await loadFixture(deployFixture);
    const listingId = id("L-1");
    const agentId = id("A-1");
    const price = ethers.parseEther("0.05");

    await expect(
      market.connect(seller).listAgent(listingId, agentId, price, DAY)
    ).to.emit(market, "AgentListed");

    const l = await market.listings(listingId);
    expect(l.seller).to.equal(seller.address);
    expect(l.price).to.equal(price);
    expect(l.active).to.equal(true);
  });

  it("settles a purchase with the correct fee split", async () => {
    const { market, treasury, seller, buyer } = await loadFixture(deployFixture);
    const listingId = id("L-2");
    const price = ethers.parseEther("1");
    await market.connect(seller).listAgent(listingId, id("A-2"), price, DAY);

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const sellerBefore = await ethers.provider.getBalance(seller.address);

    await expect(
      market.connect(buyer).buyAgent(listingId, { value: price })
    ).to.emit(market, "AgentSold");

    const expectedFee = (price * BigInt(FEE_BPS)) / 10_000n;
    const expectedPayout = price - expectedFee;

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    const sellerAfter = await ethers.provider.getBalance(seller.address);

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    expect(sellerAfter - sellerBefore).to.equal(expectedPayout);

    const l = await market.listings(listingId);
    expect(l.active).to.equal(false);
  });

  it("rejects wrong-price purchases", async () => {
    const { market, seller, buyer } = await loadFixture(deployFixture);
    const listingId = id("L-3");
    const price = ethers.parseEther("0.1");
    await market.connect(seller).listAgent(listingId, id("A-3"), price, DAY);

    await expect(
      market.connect(buyer).buyAgent(listingId, { value: price - 1n })
    ).to.be.revertedWith("wrong price");
  });

  it("lets the seller cancel an active listing", async () => {
    const { market, seller, buyer } = await loadFixture(deployFixture);
    const listingId = id("L-4");
    const price = ethers.parseEther("0.01");
    await market.connect(seller).listAgent(listingId, id("A-4"), price, DAY);

    await expect(market.connect(seller).cancelListing(listingId))
      .to.emit(market, "ListingCancelled");

    await expect(
      market.connect(buyer).buyAgent(listingId, { value: price })
    ).to.be.revertedWith("not active");
  });

  it("blocks self-purchase", async () => {
    const { market, seller } = await loadFixture(deployFixture);
    const listingId = id("L-5");
    const price = ethers.parseEther("0.01");
    await market.connect(seller).listAgent(listingId, id("A-5"), price, DAY);

    await expect(
      market.connect(seller).buyAgent(listingId, { value: price })
    ).to.be.revertedWith("self-buy");
  });

  it("rejects purchases past expiry", async () => {
    const { market, seller, buyer } = await loadFixture(deployFixture);
    const listingId = id("L-6");
    const price = ethers.parseEther("0.01");
    await market.connect(seller).listAgent(listingId, id("A-6"), price, 60);

    await time.increase(120);
    await expect(
      market.connect(buyer).buyAgent(listingId, { value: price })
    ).to.be.revertedWith("expired");
  });

  it("blocks reusing a listingId", async () => {
    const { market, seller } = await loadFixture(deployFixture);
    const listingId = id("L-7");
    const price = ethers.parseEther("0.01");
    await market.connect(seller).listAgent(listingId, id("A-7"), price, DAY);

    await expect(
      market.connect(seller).listAgent(listingId, id("A-7"), price, DAY)
    ).to.be.revertedWith("id reused");
  });

  it("caps the fee at MAX_FEE_BPS", async () => {
    const { market, admin } = await loadFixture(deployFixture);
    await expect(market.connect(admin).setFeeBps(501)).to.be.revertedWith("fee too high");
    await expect(market.connect(admin).setFeeBps(500)).to.emit(market, "FeeUpdated");
  });
});
