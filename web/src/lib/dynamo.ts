import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

import { config } from "./config";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.awsRegion }),
  { marshallOptions: { removeUndefinedValues: true } },
);

export function userSk(discordId: string) {
  return `USERID#${discordId}`;
}

export function charSk(ownerId: string, slug: string) {
  return `USERID#${ownerId}#CHAR#${slug}`;
}

export function knownSk(ownerId: string, slug: string, knownUserId: string) {
  return `USERID#${ownerId}#CHAR#${slug}#KNOWN#${knownUserId}`;
}

export function publicCharSk(publicId: string) {
  return `PUBCHAR#${publicId}`;
}

export async function getItem(pk: string, sk: string) {
  const resp = await client.send(
    new GetCommand({ TableName: config.dynamoTable, Key: { pk, sk } }),
  );
  return resp.Item;
}

export async function putItem(item: Record<string, unknown>) {
  await client.send(
    new PutCommand({ TableName: config.dynamoTable, Item: item }),
  );
}

export async function deleteItem(pk: string, sk: string) {
  await client.send(
    new DeleteCommand({ TableName: config.dynamoTable, Key: { pk, sk } }),
  );
}

/**
 * Deletes many items via BatchWriteItem (25 per request), retrying any
 * UnprocessedItems with backoff. Throws if items remain after the retries.
 */
export async function batchDeleteItems(keys: { pk: string; sk: string }[]) {
  type DeleteRequest = { DeleteRequest: { Key: Record<string, unknown> } };
  for (let i = 0; i < keys.length; i += 25) {
    let requests: DeleteRequest[] = keys
      .slice(i, i + 25)
      .map((k) => ({ DeleteRequest: { Key: { pk: k.pk, sk: k.sk } } }));
    for (let attempt = 0; requests.length > 0; attempt++) {
      if (attempt >= 6) throw new Error("Failed to delete all items; please retry");
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const resp = await client.send(
        new BatchWriteCommand({ RequestItems: { [config.dynamoTable]: requests } }),
      );
      requests = (resp.UnprocessedItems?.[config.dynamoTable] ?? []) as DeleteRequest[];
    }
  }
}

export async function queryPkSk(pk: string, skPrefix: string) {
  const resp = await client.send(
    new QueryCommand({
      TableName: config.dynamoTable,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": pk, ":sk": skPrefix },
    }),
  );
  return resp.Items ?? [];
}

/** Like queryPkSk but follows LastEvaluatedKey so results past 1MB aren't dropped. */
export async function queryPkSkAll(pk: string, skPrefix: string) {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const resp = await client.send(
      new QueryCommand({
        TableName: config.dynamoTable,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": pk, ":sk": skPrefix },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(resp.Items ?? []));
    startKey = resp.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export async function queryGsi1(gsi1pk: string) {
  const resp = await client.send(
    new QueryCommand({
      TableName: config.dynamoTable,
      IndexName: "GSI1",
      KeyConditionExpression: "gsi1pk = :gpk",
      ExpressionAttributeValues: { ":gpk": gsi1pk },
    }),
  );
  return resp.Items ?? [];
}

export async function updateItem(
  pk: string,
  sk: string,
  updateExpression: string,
  values?: Record<string, unknown>,
  names?: Record<string, string>,
) {
  await client.send(
    new UpdateCommand({
      TableName: config.dynamoTable,
      Key: { pk, sk },
      UpdateExpression: updateExpression,
      // DynamoDB rejects an empty ExpressionAttributeValues map (e.g. for REMOVE).
      ExpressionAttributeValues: values && Object.keys(values).length > 0 ? values : undefined,
      ExpressionAttributeNames: names,
    }),
  );
}

export { client as dynamoClient };
