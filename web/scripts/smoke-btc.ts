// Offline smoke test for the Bitcoin deposit library (no network, no DynamoDB writes).
// Run from web/:  npx -y tsx scripts/smoke-btc.ts
//
// Uses the official BIP84 test vectors (mnemonic "abandon x11 about"):
//   account zpub at m/84'/0'/0', master fingerprint 73c5da0a. The signing key
//   is derived from the mnemonic (BIP39 seed = PBKDF2-SHA512, 2048 rounds).

import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";

const ZPUB =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

process.env.BTC_NETWORK = "mainnet";
process.env.BTC_XPUB = ZPUB;
process.env.BTC_MASTER_FINGERPRINT = "73c5da0a";
process.env.BTC_ACCOUNT_PATH = "m/84'/0'/0'";

async function main() {
  const { HDKey } = await import("@scure/bip32");
  const { base64 } = await import("@scure/base");
  const { Transaction } = await import("@scure/btc-signer");
  const wallet = await import("../src/lib/btc/wallet");
  const { assembleWithdrawal, parseBtcAmount } = await import("../src/lib/btc/psbt");
  const { satsToUsd } = await import("../src/lib/btc/price");

  // --- BIP84 derivation vectors
  assert.equal(wallet.deriveAddress(0, 0).address, "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
  assert.equal(wallet.deriveAddress(0, 1).address, "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g");
  assert.equal(wallet.deriveAddress(1, 0).address, "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el");
  console.log("ok  BIP84 receive/change derivation matches vectors");

  // --- address validation
  assert.equal(wallet.isValidAddress("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"), true);
  assert.equal(wallet.isValidAddress("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl"), false); // wrong network
  assert.equal(wallet.isValidAddress("not-an-address"), false);
  console.log("ok  address validation");

  // --- signing info
  const info = wallet.signingInfo();
  assert.equal(info.fingerprint, 0x73c5da0a);
  assert.deepEqual(info.accountPath, [0x80000054, 0x80000000, 0x80000000]);
  console.log("ok  signing info (fingerprint + account path depth)");

  // --- amounts
  assert.equal(parseBtcAmount("0.015"), BigInt(1_500_000));
  assert.equal(parseBtcAmount("1"), BigInt(100_000_000));
  assert.equal(parseBtcAmount("0.00000001"), BigInt(1));
  assert.throws(() => parseBtcAmount("1.123456789"));
  assert.throws(() => parseBtcAmount("-1"));
  assert.equal(satsToUsd(100_000, 65_000.5), 65.0);
  assert.equal(satsToUsd(1_234_567, 100_000), 1234.56);
  console.log("ok  BTC amount parsing / USD conversion (floored to cents)");

  // --- PSBT assembly + sign with the vector private key + finalize
  const fakeTxid = (n: number) => n.toString(16).padStart(64, "0");
  const utxos = [
    { txid: fakeTxid(1), vout: 0, value: 150_000, status: { confirmed: true }, derived: wallet.deriveAddress(0, 0) },
    { txid: fakeTxid(2), vout: 1, value: 80_000, status: { confirmed: true }, derived: wallet.deriveAddress(0, 1) },
    { txid: fakeTxid(3), vout: 0, value: 40_000, status: { confirmed: true }, derived: wallet.deriveAddress(1, 0) },
  ];
  const seed = pbkdf2Sync(MNEMONIC.normalize("NFKD"), "mnemonic", 2048, 64, "sha512");
  const master = HDKey.fromMasterSeed(seed, { public: 0x04b24746, private: 0x04b2430c });
  assert.equal(master.fingerprint, 0x73c5da0a, "master fingerprint");
  const account = master.derive("m/84'/0'/0'");
  assert.equal(account.publicExtendedKey, ZPUB, "seed-derived account zpub matches BTC_XPUB");
  console.log("ok  mnemonic → fingerprint 73c5da0a and account zpub match config");
  const keyFor = (chain: number, index: number) => account.deriveChild(chain).deriveChild(index).privateKey!;

  function signAndFinalize(psbtB64: string) {
    const tx = Transaction.fromPSBT(base64.decode(psbtB64));
    for (let i = 0; i < tx.inputsLength; i++) {
      const [, d] = tx.getInput(i).bip32Derivation![0];
      assert.equal(d.fingerprint, 0x73c5da0a);
      tx.signIdx(keyFor(d.path[3], d.path[4]), i);
    }
    tx.finalize();
    return tx;
  }

  const dest = "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g";
  const partial = assembleWithdrawal(utxos, 1, { destination: dest, amountBtc: "0.001", sendMax: false, feeRate: 5 });
  assert.equal(partial.sendSats, 100_000);
  assert.ok(partial.feeSats > 0 && partial.feeSats < 5_000, `fee ${partial.feeSats}`);
  assert.equal(partial.inputSats, partial.sendSats + partial.feeSats + partial.changeSats);
  assert.equal(partial.changeAddress, wallet.deriveAddress(1, 1).address);
  const signedPartial = signAndFinalize(partial.psbtBase64);
  const changeOut = Array.from({ length: signedPartial.outputsLength }, (_, i) => signedPartial.getOutput(i)).find(
    (o) => o.amount === BigInt(partial.changeSats),
  );
  assert.ok(changeOut, "change output present");
  console.log(
    `ok  partial withdrawal: ${partial.inputCount} inputs, send ${partial.sendSats}, fee ${partial.feeSats}, change ${partial.changeSats} → signed+finalized (${signedPartial.vsize} vB)`,
  );

  const max = assembleWithdrawal(utxos, 1, { destination: dest, sendMax: true, feeRate: 5 });
  assert.equal(max.inputCount, 3);
  assert.equal(max.changeSats, 0);
  assert.equal(max.sendSats + max.feeSats, 270_000);
  const signedMax = signAndFinalize(max.psbtBase64);
  assert.ok(max.feeSats >= signedMax.vsize * 5, "send-max fee covers actual vsize at the requested rate");
  console.log(`ok  send-max withdrawal: send ${max.sendSats}, fee ${max.feeSats} (actual ${signedMax.vsize} vB)`);

  assert.throws(() => assembleWithdrawal(utxos, 1, { destination: dest, amountBtc: "1", sendMax: false, feeRate: 5 }));
  assert.throws(() => assembleWithdrawal(utxos, 1, { destination: "tb1qxyz", amountBtc: "0.001", sendMax: false, feeRate: 5 }));
  console.log("ok  insufficient funds / bad destination rejected");

  console.log("\nAll Bitcoin smoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
