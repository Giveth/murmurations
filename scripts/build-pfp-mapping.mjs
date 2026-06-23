// Regenerate public/assets/pfp-mapping.json from on-chain Transfer events
// of the ETHSecurity Badge contract on mainnet. Sorts the 200 holders
// lexicographically (lowercase) and maps them 1:1 to PFP indices 1..200.
//
// Run: node scripts/build-pfp-mapping.mjs
import fs from "node:fs/promises";

const RPC = "https://ethereum-rpc.publicnode.com";
const CONTRACT = "0xf67c0ade41c607efebf198f9d6065ab1ec5ad4cd";
const TOPIC_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const bn = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }) }).then((r) => r.json());
const cur = parseInt(bn.result, 16);
console.log("current block:", cur);

const allTransfers = [];
for (let depth = 0; depth < 2_500_000; depth += 49999) {
  const to = cur - depth;
  const from = Math.max(0, to - 49999);
  const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", method: "eth_getLogs", params: [{
      address: CONTRACT,
      topics: [TOPIC_TRANSFER],
      fromBlock: "0x" + from.toString(16),
      toBlock: "0x" + to.toString(16),
    }], id: 2,
  }) }).then((r) => r.json());
  if (res.error) { console.log("chunk err:", res.error.message); await new Promise((r) => setTimeout(r, 1000)); continue; }
  allTransfers.push(...(res.result || []));
  if (from === 0) break;
  await new Promise((r) => setTimeout(r, 100));
}
allTransfers.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
const ownerMap = new Map();
for (const log of allTransfers) {
  const tokenId = parseInt(log.topics[3], 16);
  const toAddr = "0x" + log.topics[2].slice(26);
  ownerMap.set(tokenId, toAddr);
}
const ZERO = "0x0000000000000000000000000000000000000000";
const holders = [...ownerMap.values()].filter((a) => a !== ZERO).map((a) => a.toLowerCase());
const unique = [...new Set(holders)].sort();

const mapping = {};
unique.forEach((addr, i) => { mapping[addr] = i + 1; });
await fs.writeFile("public/assets/pfp-mapping.json", JSON.stringify({
  generatedAt: new Date().toISOString(),
  contract: CONTRACT,
  chainId: 1,
  holderCount: unique.length,
  pfpCount: 200,
  mapping,
}, null, 2));
console.log(`Wrote public/assets/pfp-mapping.json with ${unique.length} entries`);
