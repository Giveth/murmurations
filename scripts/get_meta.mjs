import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
const abi = [
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "nextId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
];
const pub = createPublicClient({ chain: arbitrum, transport: http() });
const c = "0x32d664ca9ea4bad60b2b8ed61dec30692df43ac9";
console.log("name:  ", await pub.readContract({ address: c, abi, functionName: "name" }));
console.log("symbol:", await pub.readContract({ address: c, abi, functionName: "symbol" }));
console.log("nextId:", (await pub.readContract({ address: c, abi, functionName: "nextId" })).toString());
