// Deploy TheDAOLogTallyCommit to Arbitrum One. Pattern mirrors
// scripts/deploy-badge.mjs — same deployer wallet, save to the same
// contracts log.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KEY_FILE = "C:\\Users\\Xerxes\\Xerxes-Claude\\.secrets\\thedaolog_deployer.json";

const sourcePath = path.join(ROOT, "contracts", "TheDAOLogTallyCommit.sol");
const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: { "TheDAOLogTallyCommit.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

console.log("▸ Compiling…");
const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (compiled.errors || []).filter((e) => e.severity === "error");
if (errors.length) { for (const e of errors) console.error(e.formattedMessage); process.exit(1); }
const c = compiled.contracts["TheDAOLogTallyCommit.sol"]["TheDAOLogTallyCommit"];
const abi = c.abi;
const bytecode = "0x" + c.evm.bytecode.object;
console.log("  bytecode size:", (bytecode.length - 2) / 2, "bytes");

const { privateKey, address: deployerAddress } = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
const account = privateKeyToAccount(privateKey);
if (account.address.toLowerCase() !== deployerAddress.toLowerCase()) {
  throw new Error(`Key file address mismatch: ${account.address} vs ${deployerAddress}`);
}

const pub = createPublicClient({ chain: arbitrum, transport: http() });
const wc = createWalletClient({ account, chain: arbitrum, transport: http() });
const balance = await pub.getBalance({ address: account.address });
console.log(`▸ Deployer: ${account.address}  balance: ${formatEther(balance)} ETH`);

console.log("▸ Sending deploy tx…");
const txHash = await wc.deployContract({
  abi,
  bytecode,
  args: [account.address],  // deployer is also admin (can transferAdmin later to Zep)
});
console.log("  tx:", txHash);
console.log("  https://arbiscan.io/tx/" + txHash);

const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") throw new Error("deploy failed");
console.log(`✅ deployed at ${receipt.contractAddress}`);
console.log(`   gas: ${receipt.gasUsed}  cost: ${formatEther(receipt.gasUsed * receipt.effectiveGasPrice)} ETH`);

// Append to contracts log alongside the BUIDLER badge
const logFile = "C:\\Users\\Xerxes\\Xerxes-Claude\\.secrets\\thedaolog_contracts.json";
const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : { contracts: [] };
log.contracts.push({
  name: "TheDAOLogTallyCommit",
  chain: "arbitrum-one",
  chainId: 42161,
  address: receipt.contractAddress,
  deployer: account.address,
  admin: account.address,
  txHash,
  blockNumber: receipt.blockNumber.toString(),
  deployedAt: new Date().toISOString(),
  abi,
});
fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
console.log(`▸ logged to ${logFile}`);
