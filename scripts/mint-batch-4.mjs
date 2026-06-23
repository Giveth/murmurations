import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  decodeEventLog,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { readDeployerKey } from "./deployer-key.mjs";

const { privateKey } = readDeployerKey();
const account = privateKeyToAccount(privateKey);
const CONTRACT = "0x32d664ca9ea4bad60b2b8ed61dec30692df43ac9";

const RECIPIENTS = [
  { name: "holder",   addr: "0x585c4d8f227AD78b0991176f0DF27d2393F7228d" },
  { name: "holder", addr: "0x2d792c87C41131A3E6c13C83359E3C6Ab7D33Ed4" },
  { name: "holder",   addr: "0x29EE09Bd0f7f41EcD083Ad2708Df17691065790B" },
  { name: "holder",   addr: "0xF6D7E64444b35fbA42876F6639A5Ae1d54f1f740" },
];

// Validate + checksum-normalize each address (throws if any is invalid).
const normalized = RECIPIENTS.map((r) => ({ ...r, addr: getAddress(r.addr) }));

const abi = [
  { type: "function", name: "safeMintBatch", inputs: [{ type: "address[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "nextId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "event", name: "Transfer", inputs: [
      { type: "address", indexed: true, name: "from" },
      { type: "address", indexed: true, name: "to" },
      { type: "uint256", indexed: true, name: "tokenId" },
    ] },
];

const pub = createPublicClient({ chain: arbitrum, transport: http() });
const wc = createWalletClient({ account, chain: arbitrum, transport: http() });

console.log("▸ Deployer:", account.address);
const bal = await pub.getBalance({ address: account.address });
console.log("  ETH:", formatEther(bal));
const nextIdBefore = await pub.readContract({ address: CONTRACT, abi, functionName: "nextId" });
console.log("  nextId before:", nextIdBefore.toString(), "  → expected new tokens:", normalized.map((_, i) => Number(nextIdBefore) + i).join(", "));

console.log("▸ Pre-mint balances (to detect already-minted recipients):");
for (const r of normalized) {
  const b = await pub.readContract({ address: CONTRACT, abi, functionName: "balanceOf", args: [r.addr] });
  console.log(`  ${r.name.padEnd(8)} ${r.addr}  balance=${b}`);
}

console.log("▸ Submitting safeMintBatch tx…");
const txHash = await wc.writeContract({
  address: CONTRACT,
  abi,
  functionName: "safeMintBatch",
  args: [normalized.map((r) => r.addr)],
});
console.log("  tx:", txHash);
console.log("  https://arbiscan.io/tx/" + txHash);

console.log("▸ Waiting for receipt…");
const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") throw new Error("mint batch failed");
const cost = receipt.gasUsed * receipt.effectiveGasPrice;
console.log(`✅ minted. gas=${receipt.gasUsed}  cost=${formatEther(cost)} ETH`);

// Decode Transfer events to confirm token ID → recipient mapping.
const transfers = [];
for (const log of receipt.logs) {
  try {
    const dec = decodeEventLog({ abi, data: log.data, topics: log.topics });
    if (dec.eventName === "Transfer" && dec.args.from === "0x0000000000000000000000000000000000000000") {
      transfers.push({ tokenId: dec.args.tokenId.toString(), to: dec.args.to });
    }
  } catch {}
}
console.log("\n▸ Mints from this tx:");
for (const t of transfers) {
  const recipient = normalized.find((r) => r.addr.toLowerCase() === t.to.toLowerCase());
  console.log(`  token #${t.tokenId} → ${recipient?.name ?? "?"} (${t.to})`);
}

const nextIdAfter = await pub.readContract({ address: CONTRACT, abi, functionName: "nextId" });
console.log("\n  nextId after:", nextIdAfter.toString());
