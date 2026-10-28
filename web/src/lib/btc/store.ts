// DynamoDB persistence for Bitcoin deposit addresses and deposits.
//
// Items live in their own partition (pk = "BTC"), namespaced by xpubId so that
// changing BTC_XPUB / BTC_NETWORK starts a clean address set:
//   COUNTER#{xpubId}#receive         next receive index (atomic ADD)
//   USERADDR#{xpubId}#{userId}       a user's deposit address
//   DEP#{xpubId}#{txid}:{vout}       one deposit output (GSI1 BTCDEP#{xpubId}#{userId})

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { config } from "../config";
import { dynamoClient, getItem, queryGsi1, queryPkSkAll, userSk } from "../dynamo";
import { getBtcUsdPrice, satsToUsd } from "./price";
import type { AdminDepositView, DepositStatus } from "./types";
import { deriveAddress, getWallet } from "./wallet";

const PK = "BTC";
const TABLE = () => config.dynamoTable;

const counterSk = (xpubId: string) => `COUNTER#${xpubId}#receive`;
const userAddrSk = (xpubId: string, userId: string) => `USERADDR#${xpubId}#${userId}`;
const depositSk = (xpubId: string, outpoint: string) => `DEP#${xpubId}#${outpoint}`;
const depositGsi = (xpubId: string, userId: string) => `BTCDEP#${xpubId}#${userId}`;

function isConditionalFailure(e: unknown): boolean {
  return (
    e instanceof ConditionalCheckFailedException ||
    (e as { name?: string } | null)?.name === "ConditionalCheckFailedException"
  );
}

export type DepositAddressRecord = {
  userId: string;
  address: string;
  index: number;
  createdAt: string;
  watchUntil?: number;
};

export type DepositRecord = AdminDepositView & { vout: number; blockHeight?: number };

function toAddressRecord(item: Record<string, unknown>): DepositAddressRecord {
  return {
    userId: String(item.userId),
    address: String(item.address),
    index: Number(item.index),
    createdAt: String(item.createdAt ?? ""),
    watchUntil: item.watchUntil === undefined ? undefined : Number(item.watchUntil),
  };
}

function toDepositRecord(item: Record<string, unknown>): DepositRecord {
  return {
    outpoint: String(item.outpoint),
    txid: String(item.txid),
    vout: Number(item.vout),
    userId: String(item.userId),
    address: String(item.address),
    sats: Number(item.sats),
    status: String(item.status) as DepositStatus,
    confirmations: Number(item.confirmations ?? 0),
    blockHeight: item.blockHeight === undefined ? undefined : Number(item.blockHeight),
    detectedAt: String(item.detectedAt ?? ""),
    creditedAt: item.creditedAt === undefined ? undefined : String(item.creditedAt),
    usdCredited: item.usdCredited === undefined ? undefined : Number(item.usdCredited),
    btcUsdPrice: item.btcUsdPrice === undefined ? undefined : Number(item.btcUsdPrice),
  };
}

// ---------------------------------------------------------------- addresses

export async function getDepositAddress(userId: string): Promise<DepositAddressRecord | null> {
  const item = await getItem(PK, userAddrSk(getWallet().xpubId, userId));
  return item ? toAddressRecord(item) : null;
}

/** Returns the user's deposit address, allocating the next receive index on first use. */
export async function getOrCreateDepositAddress(userId: string): Promise<DepositAddressRecord> {
  const existing = await getDepositAddress(userId);
  if (existing) return existing;

  const { xpubId } = getWallet();
  const resp = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: PK, sk: counterSk(xpubId) },
      UpdateExpression: "ADD nextIndex :one",
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const index = Number(resp.Attributes?.nextIndex) - 1;
  const { address } = deriveAddress(0, index);
  const record: DepositAddressRecord = { userId, address, index, createdAt: new Date().toISOString() };

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE(),
        Item: { pk: PK, sk: userAddrSk(xpubId, userId), ...record },
        ConditionExpression: "attribute_not_exists(sk)",
      }),
    );
    return record;
  } catch (e) {
    // A concurrent request assigned this user first; that index is simply skipped.
    if (!isConditionalFailure(e)) throw e;
    const winner = await getDepositAddress(userId);
    if (!winner) throw e;
    return winner;
  }
}

/** Number of receive indexes ever allocated (0..n-1), including any skipped by races. */
export async function getReceiveIndexCount(): Promise<number> {
  const item = await getItem(PK, counterSk(getWallet().xpubId));
  return Number(item?.nextIndex ?? 0);
}

/** Asks the watcher to poll this user's address every cycle for a while. */
export async function markAddressHot(userId: string, durationMs: number): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: { pk: PK, sk: userAddrSk(getWallet().xpubId, userId) },
        UpdateExpression: "SET watchUntil = :t",
        ConditionExpression: "attribute_exists(sk)",
        ExpressionAttributeValues: { ":t": Date.now() + durationMs },
      }),
    );
  } catch (e) {
    if (!isConditionalFailure(e)) throw e;
  }
}

export async function listDepositAddresses(): Promise<DepositAddressRecord[]> {
  const items = await queryPkSkAll(PK, `USERADDR#${getWallet().xpubId}#`);
  return items.map(toAddressRecord);
}

// ---------------------------------------------------------------- deposits

export async function listAllDeposits(): Promise<DepositRecord[]> {
  const items = await queryPkSkAll(PK, `DEP#${getWallet().xpubId}#`);
  return items.map(toDepositRecord).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export async function listUserDeposits(userId: string): Promise<DepositRecord[]> {
  const items = await queryGsi1(depositGsi(getWallet().xpubId, userId));
  return items.map(toDepositRecord).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

async function getDeposit(outpoint: string): Promise<DepositRecord | null> {
  const item = await getItem(PK, depositSk(getWallet().xpubId, outpoint));
  return item ? toDepositRecord(item) : null;
}

/** Records a newly seen deposit output. Returns the stored record (existing one if already present). */
export async function recordDeposit(
  dep: Omit<DepositRecord, "status" | "detectedAt">,
): Promise<DepositRecord> {
  const { xpubId } = getWallet();
  const record: DepositRecord = { ...dep, status: "pending", detectedAt: new Date().toISOString() };
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          pk: PK,
          sk: depositSk(xpubId, dep.outpoint),
          gsi1pk: depositGsi(xpubId, dep.userId),
          gsi1sk: record.detectedAt,
          ...record,
        },
        ConditionExpression: "attribute_not_exists(sk)",
      }),
    );
    return record;
  } catch (e) {
    if (!isConditionalFailure(e)) throw e;
    return (await getDeposit(dep.outpoint)) ?? record;
  }
}

/** Updates confirmation progress on a deposit that hasn't been credited yet. */
export async function updateDepositProgress(
  dep: DepositRecord,
  confirmations: number,
  blockHeight: number | undefined,
  status: "pending" | "dropped",
): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: { pk: PK, sk: depositSk(getWallet().xpubId, dep.outpoint) },
        UpdateExpression:
          blockHeight === undefined
            ? "SET confirmations = :c, #s = :s REMOVE blockHeight"
            : "SET confirmations = :c, #s = :s, blockHeight = :h",
        ConditionExpression: "#s IN (:pending, :dropped)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":c": confirmations,
          ":s": status,
          ":pending": "pending",
          ":dropped": "dropped",
          ...(blockHeight === undefined ? {} : { ":h": blockHeight }),
        },
      }),
    );
    dep.confirmations = confirmations;
    dep.blockHeight = blockHeight;
    dep.status = status;
  } catch (e) {
    if (!isConditionalFailure(e)) throw e;
  }
}

/**
 * Credits a confirmed deposit to the user's budget exactly once.
 *
 * Three idempotent steps so a crash at any point is safely resumed next cycle:
 *  1. pending → crediting, freezing the BTC price and USD amount on the deposit;
 *  2. add the USD to the user's budgetUsd, guarded by the outpoint not already
 *     being in the user's btcCreditedOutpoints set (single-item atomic update);
 *  3. crediting → credited.
 */
export async function creditDeposit(dep: DepositRecord): Promise<void> {
  const { xpubId } = getWallet();
  const key = { pk: PK, sk: depositSk(xpubId, dep.outpoint) };

  if (dep.status === "pending") {
    const price = await getBtcUsdPrice();
    const usd = satsToUsd(dep.sats, price);
    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: TABLE(),
          Key: key,
          UpdateExpression: "SET #s = :crediting, btcUsdPrice = :p, usdCredited = :u, confirmations = :c",
          ConditionExpression: "#s = :pending",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":crediting": "crediting",
            ":pending": "pending",
            ":p": price,
            ":u": usd,
            ":c": dep.confirmations,
          },
        }),
      );
      Object.assign(dep, { status: "crediting", btcUsdPrice: price, usdCredited: usd });
    } catch (e) {
      if (!isConditionalFailure(e)) throw e;
      const fresh = await getDeposit(dep.outpoint);
      if (!fresh || fresh.status !== "crediting") return; // another process finished it
      Object.assign(dep, fresh);
    }
  }
  if (dep.status !== "crediting" || dep.usdCredited === undefined) return;

  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: { pk: "USERS", sk: userSk(dep.userId) },
        UpdateExpression:
          "SET budgetUsd = if_not_exists(budgetUsd, :base) + :amt, " +
          "btcDepositedUsd = if_not_exists(btcDepositedUsd, :zero) + :amt " +
          "ADD btcCreditedOutpoints :ops",
        ConditionExpression: "attribute_exists(sk) AND NOT contains(btcCreditedOutpoints, :op)",
        ExpressionAttributeValues: {
          ":base": config.budgetUsd,
          ":zero": 0,
          ":amt": dep.usdCredited,
          ":ops": new Set([dep.outpoint]),
          ":op": dep.outpoint,
        },
      }),
    );
    console.log(
      `[btc] credited ${dep.sats} sats ($${dep.usdCredited}) to user ${dep.userId} (${dep.outpoint})`,
    );
  } catch (e) {
    if (!isConditionalFailure(e)) throw e;
    const user = await getItem("USERS", userSk(dep.userId));
    if (!user) {
      console.error(`[btc] deposit ${dep.outpoint} belongs to missing user ${dep.userId}; not credited`);
      return;
    }
    // Otherwise the outpoint was already credited (crash between steps 2 and 3).
  }

  try {
    const creditedAt = new Date().toISOString();
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key,
        UpdateExpression: "SET #s = :credited, creditedAt = :t",
        ConditionExpression: "#s = :crediting",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":credited": "credited", ":crediting": "crediting", ":t": creditedAt },
      }),
    );
    Object.assign(dep, { status: "credited", creditedAt });
  } catch (e) {
    if (!isConditionalFailure(e)) throw e;
  }
}
