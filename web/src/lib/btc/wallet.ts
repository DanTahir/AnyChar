import { createHash } from "node:crypto";

import { HDKey } from "@scure/bip32";
import { Address, NETWORK, TEST_NETWORK, bip32Path, p2wpkh } from "@scure/btc-signer";

import { btcConfig, btcConfigError } from "./config";

// SLIP-132 public versions. Only native segwit (P2WPKH) is supported: zpub/vpub
// are unambiguous; xpub/tpub are accepted for wallets (e.g. Sparrow) that export
// a native-segwit account key with the generic prefix.
const XPUB_VERSIONS = [
  { prefix: "zpub", version: 0x04b24746, mainnet: true },
  { prefix: "xpub", version: 0x0488b21e, mainnet: true },
  { prefix: "vpub", version: 0x045f1cf6, mainnet: false },
  { prefix: "tpub", version: 0x043587cf, mainnet: false },
] as const;

export type Chain = 0 | 1; // 0 = receive (user deposit addresses), 1 = change

type Wallet = { account: HDKey; chains: [HDKey, HDKey]; xpubId: string };

let cachedWallet: Wallet | null = null;

export function btcNetworkParams() {
  return btcConfig.network === "mainnet" ? NETWORK : TEST_NETWORK;
}

export function getWallet(): Wallet {
  if (cachedWallet) return cachedWallet;
  if (btcConfigError) throw new Error(btcConfigError);
  const key = btcConfig.xpub;
  if (!key) throw new Error("Bitcoin deposits are not configured (BTC_XPUB missing)");

  const entry = XPUB_VERSIONS.find((v) => key.startsWith(v.prefix));
  if (!entry) {
    throw new Error(
      "BTC_XPUB must be a native-segwit account key (zpub/vpub, or xpub/tpub of a native-segwit wallet)",
    );
  }
  if (entry.mainnet !== (btcConfig.network === "mainnet")) {
    throw new Error(`BTC_XPUB (${entry.prefix}) does not match BTC_NETWORK=${btcConfig.network}`);
  }

  const account = HDKey.fromExtendedKey(key, { public: entry.version, private: 0 });
  if (account.privateKey) throw new Error("BTC_XPUB must be a PUBLIC key — never put a private key here");

  // Namespaces every DynamoDB record, so swapping keys/networks never mixes address sets.
  const xpubId = createHash("sha256").update(key).digest("hex").slice(0, 16);
  cachedWallet = { account, chains: [account.deriveChild(0), account.deriveChild(1)], xpubId };
  return cachedWallet;
}

export type DerivedAddress = {
  chain: Chain;
  index: number;
  address: string;
  pubkey: Uint8Array;
  script: Uint8Array;
};

export function deriveAddress(chain: Chain, index: number): DerivedAddress {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error(`Invalid derivation index ${index}`);
  }
  const node = getWallet().chains[chain].deriveChild(index);
  const pubkey = node.publicKey;
  if (!pubkey) throw new Error("Derivation produced no public key");
  const pay = p2wpkh(pubkey, btcNetworkParams());
  if (!pay.address) throw new Error("Failed to encode address");
  return { chain, index, address: pay.address, pubkey, script: pay.script };
}

export function isValidAddress(address: string): boolean {
  try {
    Address(btcNetworkParams()).decode(address);
    return true;
  } catch {
    return false;
  }
}

/** Fingerprint + account path, validated, for adding BIP32 derivation info to PSBTs. */
export function signingInfo(): { fingerprint: number; accountPath: number[] } {
  const fp = btcConfig.masterFingerprint;
  if (!/^[0-9a-f]{8}$/.test(fp)) {
    throw new Error(
      "BTC_MASTER_FINGERPRINT must be set to your wallet's 8-hex-char master fingerprint to build withdrawals",
    );
  }
  let accountPath: number[];
  try {
    accountPath = bip32Path(btcConfig.accountPath);
  } catch {
    throw new Error(`BTC_ACCOUNT_PATH "${btcConfig.accountPath}" is not a valid BIP32 path`);
  }
  const depth = getWallet().account.depth;
  if (accountPath.length !== depth) {
    throw new Error(
      `BTC_ACCOUNT_PATH has ${accountPath.length} levels but BTC_XPUB is at depth ${depth}`,
    );
  }
  return { fingerprint: parseInt(fp, 16), accountPath };
}

export function bip32Derivation(
  d: DerivedAddress,
  info: { fingerprint: number; accountPath: number[] },
): [Uint8Array, { fingerprint: number; path: number[] }][] {
  return [[d.pubkey, { fingerprint: info.fingerprint, path: [...info.accountPath, d.chain, d.index] }]];
}
