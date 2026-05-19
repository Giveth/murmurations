import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
const pub = createPublicClient({ chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com") });
const addr = await pub.getEnsAddress({ name: "griff.eth" });
console.log("griff.eth ->", addr);
