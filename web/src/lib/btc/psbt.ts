// Withdrawal PSBT construction and signed-transaction broadcast.

import { base64, hex } from "@scure/base";
import { Transaction, selectUTXO } from "@scure/btc-signer";

import { broadcastTx } from "./esplora";
import { type SpendableUtxo, invalidateWalletScan, listSpendableUtxos } from "./scan";
import { bip32Derivation, btcNetworkParams, deriveAddress, isValidAddress, signingInfo } from "./wallet";

// BigInt() calls rather than literals: tsconfig targets ES2017.
const ZERO = BigInt(0);
const DUST_SATS = BigInt(546);
const SATS_PER_BTC = BigInt(100_000_000);
const MAX_FEE_RATE = 1000;
// Conservative vsize estimates (P2WPKH inputs; largest common output type).
const TX_OVERHEAD_VB = 11;
const P2WPKH_INPUT_VB = 68;
const MAX_OUTPUT_VB = 43;

export type WithdrawalRequest = {
  destination: string;
  /** Decimal BTC string, e.g. "0.015". Ignored when sendMax is true. */
  amountBtc?: string;
  sendMax: boolean;
  feeRate: number; // sat/vB
};

export type WithdrawalPsbt = {
  psbtBase64: string;
  destination: string;
  sendSats: number;
  feeSats: number;
  changeSats: number;
  changeAddress?: string;
  inputCount: number;
  inputSats: number;
};

export function parseBtcAmount(raw: string): bigint {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error("Amount must be a BTC value with at most 8 decimals");
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * SATS_PER_BTC + BigInt(frac.padEnd(8, "0"));
}

export async function buildWithdrawalPsbt(req: WithdrawalRequest): Promise<WithdrawalPsbt> {
  const { scan, utxos } = await listSpendableUtxos();
  return assembleWithdrawal(utxos, scan.nextChangeIndex, req);
}

/** Pure PSBT assembly from a given UTXO set (no network access). */
export function assembleWithdrawal(
  utxos: SpendableUtxo[],
  nextChangeIndex: number,
  req: WithdrawalRequest,
): WithdrawalPsbt {
  const destination = req.destination.trim();
  if (!isValidAddress(destination)) throw new Error("Destination is not a valid address for this network");
  if (!Number.isInteger(req.feeRate) || req.feeRate < 1 || req.feeRate > MAX_FEE_RATE) {
    throw new Error(`Fee rate must be a whole number between 1 and ${MAX_FEE_RATE} sat/vB`);
  }
  const info = signingInfo();
  const network = btcNetworkParams();

  if (utxos.length === 0) throw new Error("No confirmed funds available to withdraw");

  const inputs = utxos.map((u) => ({
    txid: hex.decode(u.txid),
    index: u.vout,
    witnessUtxo: { script: u.derived.script, amount: BigInt(u.value) },
    bip32Derivation: bip32Derivation(u.derived, info),
  }));
  const inputSats = utxos.reduce((n, u) => n + BigInt(u.value), ZERO);

  let tx: Transaction;
  let sendSats: bigint;
  let changeAddress: string | undefined;

  if (req.sendMax) {
    const vsize = TX_OVERHEAD_VB + P2WPKH_INPUT_VB * inputs.length + MAX_OUTPUT_VB;
    const fee = BigInt(Math.ceil(vsize * req.feeRate));
    sendSats = inputSats - fee;
    if (sendSats < DUST_SATS) throw new Error("Balance is too small to cover the network fee");
    tx = new Transaction();
    for (const input of inputs) tx.addInput(input);
    tx.addOutputAddress(destination, sendSats, network);
  } else {
    if (!req.amountBtc) throw new Error("Amount is required (or choose send entire balance)");
    sendSats = parseBtcAmount(req.amountBtc);
    if (sendSats < DUST_SATS) throw new Error(`Amount must be at least ${DUST_SATS} sats`);
    const change = deriveAddress(1, nextChangeIndex);
    changeAddress = change.address;
    const selected = selectUTXO(inputs, [{ address: destination, amount: sendSats }], "default", {
      feePerByte: BigInt(req.feeRate),
      changeAddress: change.address,
      network,
      bip69: true,
      createTx: true,
    });
    if (!selected?.tx) throw new Error("Insufficient confirmed funds for this amount plus fee");
    tx = selected.tx;
    // Tag the change output so the signing wallet recognises it as its own.
    for (let i = 0; i < tx.outputsLength; i++) {
      const script = tx.getOutput(i).script;
      if (script && hex.encode(script) === hex.encode(change.script)) {
        tx.updateOutput(i, { bip32Derivation: bip32Derivation(change, info) });
      }
    }
    if (!selected.change) changeAddress = undefined;
  }

  let usedInputSats = ZERO;
  for (let i = 0; i < tx.inputsLength; i++) usedInputSats += tx.getInput(i).witnessUtxo?.amount ?? ZERO;
  const feeSats = tx.fee;
  const changeSats = usedInputSats - sendSats - feeSats;

  return {
    psbtBase64: base64.encode(tx.toPSBT()),
    destination,
    sendSats: Number(sendSats),
    feeSats: Number(feeSats),
    changeSats: Number(changeSats),
    changeAddress: changeSats > ZERO ? changeAddress : undefined,
    inputCount: tx.inputsLength,
    inputSats: Number(usedInputSats),
  };
}

/**
 * Accepts a signed PSBT (base64 or hex) or a fully signed raw transaction (hex),
 * finalizes if needed, and broadcasts. Returns the txid.
 */
export async function broadcastSigned(signed: string): Promise<string> {
  const s = signed.trim().replace(/\s+/g, "");
  if (!s) throw new Error("Paste a signed PSBT or raw transaction");

  let rawHex: string;
  const isHex = /^[0-9a-fA-F]+$/.test(s);
  if (isHex && !s.toLowerCase().startsWith("70736274ff")) {
    rawHex = s.toLowerCase(); // already a raw transaction
  } else {
    let bytes: Uint8Array;
    try {
      bytes = isHex ? hex.decode(s.toLowerCase()) : base64.decode(s);
    } catch {
      throw new Error("Could not decode input as base64/hex PSBT or raw transaction hex");
    }
    const tx = Transaction.fromPSBT(bytes);
    if (!tx.isFinal) {
      try {
        tx.finalize();
      } catch (e) {
        throw new Error(`PSBT is not fully signed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    rawHex = hex.encode(tx.extract());
  }

  const txid = await broadcastTx(rawHex);
  invalidateWalletScan();
  return txid;
}
