import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
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
  values: Record<string, unknown>,
  names?: Record<string, string>,
) {
  await client.send(
    new UpdateCommand({
      TableName: config.dynamoTable,
      Key: { pk, sk },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
    }),
  );
}

export { client as dynamoClient };
