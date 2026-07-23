---
name: aws-sso-dynamo
description: >-
  Inspect AnyChar's AWS data (DynamoDB table + S3 image bucket) with the SSO
  default profile to diagnose bot/web issues. Use when investigating a user's
  character, memories, usage/budget, guild config, or any "why is the bot doing
  X" question that needs the live DynamoDB record.
---

# AWS SSO + DynamoDB inspection (AnyChar)

Read-only investigation of the live AnyChar data. Account `747360758209`,
region `us-east-1`.

## CRITICAL: never let the AWS CLI pager hang the terminal

AWS CLI v2 pipes output through a pager (`more` on Windows, even under Git
Bash). In the agent terminal that pager **blocks forever** and wedges the
whole shell. Every `aws` command MUST disable it:

- Always pass `--no-cli-pager`, AND
- Set `export AWS_PAGER=""` at the start of the session.

If the shell ever hangs with "no exit status" after an `aws` call, the pager
got you — kill it (`taskkill //IM more.com //F` in Git Bash) and restart the
terminal.

## Credentials

Profile `default` uses SSO session `cursor` (`AdministratorAccess`). The cached
token lives in `~/.aws/sso/cache/*.json` (check `expiresAt`).

```bash
export AWS_PAGER=""
aws sts get-caller-identity --no-cli-pager   # confirm creds work
# If expired:
aws sso login --profile default
```

## Data model (single-table: `AnyChar`, keys `pk`/`sk`, plus `GSI1`)

- User: `pk=USERS`, `sk=USERID#{discordId}`
- Character: `pk=USERS`, `sk=USERID#{ownerId}#CHAR#{slug}`
- Known user: `sk=USERID#{ownerId}#CHAR#{slug}#KNOWN#{userId}`
- Memory: `sk=USERID#{ownerId}#CHAR#{slug}#SERVER#{serverId}#MEMORY#...` (short)
  and `#MEMORYLT#...` (long-term)
- Guild config: `pk=GUILDS`, `sk=GUILDID#{guildId}`

A real character SK has **no extra `#`** after `#CHAR#{slug}`; anything with a
further `#` is a sub-item (known user / memory).

## Common queries

From Git Bash, use single quotes around the JSON value args (no escaping
needed). All examples assume `export AWS_PAGER=""` was set.

Get one character:

```bash
aws dynamodb get-item --no-cli-pager --region us-east-1 --table-name AnyChar \
  --key '{"pk":{"S":"USERS"},"sk":{"S":"USERID#<ownerId>#CHAR#<slug>"}}'
```

List a user's characters + sub-items (find the slug, see known users/memories):

```bash
aws dynamodb query --no-cli-pager --region us-east-1 --table-name AnyChar \
  --key-condition-expression "pk = :p AND begins_with(sk, :s)" \
  --expression-attribute-values '{":p":{"S":"USERS"},":s":{"S":"USERID#<ownerId>#CHAR#"}}'
```

Get a user record (approval, budget, usage tokens, age18plus):

```bash
aws dynamodb get-item --no-cli-pager --region us-east-1 --table-name AnyChar \
  --key '{"pk":{"S":"USERS"},"sk":{"S":"USERID#<discordId>"}}'
```

Memories for a character in a server (use `MEMORY#` or `MEMORYLT#`):

```bash
aws dynamodb query --no-cli-pager --region us-east-1 --table-name AnyChar \
  --key-condition-expression "pk = :p AND begins_with(sk, :s)" \
  --expression-attribute-values '{":p":{"S":"USERS"},":s":{"S":"USERID#<ownerId>#CHAR#<slug>#SERVER#<serverId>#MEMORY#"}}'
```

Tip: add `--projection-expression "sk"` first to list keys cheaply, then fetch
the full item you care about.

## S3 images

Bucket `anychar-images-747360758209` (private). Character/known-user portraits
are referenced by `imageS3Key` on the record.

```bash
aws s3 ls --no-cli-pager s3://anychar-images-747360758209/
```

## Scope

The default profile is admin, but for diagnosis stay **read-only**
(`get-item`, `query`, `s3 ls`). Don't `put`/`update`/`delete` against prod data
unless the user explicitly asks.
