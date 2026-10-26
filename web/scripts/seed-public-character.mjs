#!/usr/bin/env node
/**
 * Seeds (or refreshes) a public character straight into DynamoDB + S3.
 *
 * Usage (from web/):
 *   node scripts/seed-public-character.mjs scripts/public-characters/klenny.json [--dry-run]
 *
 * The JSON file holds the public character fields plus an `image` path relative
 * to the JSON file. Uses the default AWS credential chain (e.g. the SSO default
 * profile). Table/bucket/region come from DYNAMODB_TABLE / S3_BUCKET / AWS_REGION,
 * defaulting to the production values.
 *
 * Item layout must match web/src/lib/public-characters.ts:
 *   pk = "PUBLIC", sk = "PUBCHAR#{publicId}"
 *   image at public-characters/{publicId}/avatar.{ext}
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const table = process.env.DYNAMODB_TABLE || "AnyChar";
const bucket = process.env.S3_BUCKET || "anychar-images-747360758209";

const REPLY_STYLES = ["one-liner", "semi-lit", "literate", "novella"];
const MEMORY_LEVELS = ["short", "medium", "long"];
const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function checkLength(data, field, max, min = 0) {
  const v = data[field] ?? "";
  if (typeof v !== "string") fail(`${field} must be a string`);
  if (v.length < min || v.length > max) fail(`${field} must be ${min}-${max} chars (got ${v.length})`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) fail("usage: seed-public-character.mjs <character.json> [--dry-run]");

  const data = JSON.parse(await readFile(file, "utf8"));
  if (!/^[a-z0-9-]{1,80}$/.test(data.publicId ?? "")) fail("publicId must match [a-z0-9-]{1,80}");
  // Same limits as web/src/lib/schemas/character.ts.
  checkLength(data, "displayName", 100, 1);
  checkLength(data, "description", 2000);
  checkLength(data, "loves", 500);
  checkLength(data, "hates", 500);
  if (!REPLY_STYLES.includes(data.replyStyle)) fail(`replyStyle must be one of ${REPLY_STYLES}`);
  if (!MEMORY_LEVELS.includes(data.memoryLevel)) fail(`memoryLevel must be one of ${MEMORY_LEVELS}`);
  if (!data.authorDiscordId) fail("authorDiscordId is required");

  let image = null;
  if (data.image) {
    const contentType = data.imageContentType || "image/jpeg";
    const ext = EXT_BY_TYPE[contentType];
    if (!ext) fail(`unsupported imageContentType ${contentType}`);
    const body = await readFile(path.resolve(path.dirname(file), data.image));
    if (body.length > 2 * 1024 * 1024) fail("image must be 2MB or smaller");
    image = { body, contentType, key: `public-characters/${data.publicId}/avatar.${ext}` };
  }

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const sk = `PUBCHAR#${data.publicId}`;
  const existing = (await ddb.send(new GetCommand({ TableName: table, Key: { pk: "PUBLIC", sk } })))
    .Item;

  const now = new Date().toISOString();
  const item = {
    pk: "PUBLIC",
    sk,
    publicId: data.publicId,
    displayName: data.displayName,
    description: data.description ?? "",
    loves: data.loves ?? "",
    hates: data.hates ?? "",
    replyStyle: data.replyStyle,
    memoryLevel: data.memoryLevel,
    appearance: data.appearance || undefined,
    imageS3Key: image?.key,
    imageContentType: image?.contentType,
    authorDiscordId: String(data.authorDiscordId),
    authorName: data.authorName || "AnyChar",
    downloads: Number(existing?.downloads ?? 0),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  console.log(`${existing ? "Updating" : "Creating"} ${table} PUBLIC/${sk} (region ${region})`);
  if (image) console.log(`Image -> s3://${bucket}/${image.key} (${image.body.length} bytes)`);
  console.log(
    `displayName=${item.displayName} description=${item.description.length}c ` +
      `loves=${item.loves.length}c hates=${item.hates.length}c appearance=${(item.appearance ?? "").length}c`,
  );
  if (dryRun) {
    console.log("[dry-run] nothing written");
    return;
  }

  if (image) {
    await new S3Client({ region }).send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: image.key,
        Body: image.body,
        ContentType: image.contentType,
      }),
    );
  }
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  console.log("Done.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
