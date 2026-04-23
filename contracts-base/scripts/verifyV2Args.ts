/**
 * Constructor arguments for AgentsCupPackStoreV2 verification.
 * Usage:
 *   npx hardhat verify --network base --constructor-args scripts/verifyV2Args.ts <address>
 */
const CUP_WEI = 10n ** 18n;

export default [
  "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668", // cup
  "0x59A5CBC684BfED4AA83Abce9Ec637c3F2b3634Dc", // treasury
  "0x59A5CBC684BfED4AA83Abce9Ec637c3F2b3634Dc", // admin
  [1, 2, 3, 4],
  [
    (50_000n * CUP_WEI).toString(),
    (100_000n * CUP_WEI).toString(),
    (250_000n * CUP_WEI).toString(),
    (750_000n * CUP_WEI).toString(),
  ],
];
