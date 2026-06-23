import "dotenv/config";
import fs from "node:fs";

function normalizePrivateKey(privateKey) {
  if (!privateKey) return "";
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

export function readDeployerKey() {
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    return {
      privateKey: normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY),
      address: process.env.DEPLOYER_ADDRESS || "",
    };
  }

  const keyFile = process.env.DEPLOYER_KEY_FILE;
  if (!keyFile) {
    throw new Error("Set DEPLOYER_PRIVATE_KEY or DEPLOYER_KEY_FILE in .env");
  }

  const key = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  return {
    ...key,
    privateKey: normalizePrivateKey(key.privateKey),
  };
}

export function getContractsLogFile() {
  return process.env.CONTRACTS_LOG_FILE || "data/thedaolog_contracts.json";
}
