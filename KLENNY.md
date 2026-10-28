# AnyChar — project guide

Multi-tenant Discord roleplay bot. Users create characters on a Next.js dashboard; the bot
plays those characters in Discord servers/DMs via OpenRouter LLMs. All state lives in one
DynamoDB table plus one private S3 bucket.

| Dir | What |
|---|---|
| `bot/` | Python discord.py bot (httpx → OpenRouter, boto3 → DynamoDB/S3) |
| `web/` | Next.js 16 App Router dashboard, Auth.js (next-auth v5 beta) Discord OAuth, Tailwind v4 |
| `infra/` | AWS setup scripts (table, bucket, IAM policy, admin seed) |
| `ecosystem.config.json` | pm2 apps `anychar-bot` and `anychar-web` |

Project skills (read them, don't duplicate here):
- **`ec2-deploy`** — SSH/pm2 deploy to the live host, git-on-Git-Bash gotchas.
- **`aws-sso-dynamo`** — read-only inspection of live DynamoDB/S3 with the SSO profile
  (always `--no-cli-pager` / `AWS_PAGER=""` or the shell hangs).

`.cursor/skills/` holds older copies of the same skills; `.klenny/skills/` is the maintained version.

## Commands

```bash
# Bot — run from bot/ (flat imports like `from config import ...`; importing dynamo builds the boto3 table)
cd bot && python -m venv .venv && source .venv/Scripts/activate && pip install -r requirements.txt
python main.py
python scripts/smoke_test_conversation_cache.py      # standalone smoke tests, no pytest
python scripts/smoke_test_histitem_from_message.py
python scripts/backfill_appearance.py --dry-run      # one-off appearance backfill

# Web
cd web && npm ci
npm run dev | npm run build | npm start
npm run lint        # eslint; memory-viewer.tsx has pre-existing react-hooks/set-state-in-effect errors
```

There is no test runner for either side. After a change, run `npm run lint` and `npm run build`
for web and a quick import/smoke check for the bot.

**Next.js 16 warning** (`web/AGENTS.md`): APIs differ from training data. Check
`node_modules/next/dist/docs/` before writing Next-specific code.

## Bot architecture (`bot/`)

| Module | Role |
|---|---|
| `main.py` | Client, slash commands (`/help`, `/character`, `/listcharacters`, `/setcharacter`, `/describecharacter`), `on_message` orchestration |
| `config.py` | Env + constants (default/adult starred models, `BUDGET_USD=10`, `THREAD_MESSAGE_LIMIT=100`, conversation-cache TTLs) |
| `dynamo.py` | All DynamoDB access |
| `runtime.py` | Builds `RuntimeConfig` (owner, character, known users, decrypted key); memory load/create/compaction (`_MEMORY_LIMITS` per `memoryLevel`) |
| `prompt_builder.py` | System prompt: character, known users, memories, content policy, roleplay rules, reply style |
| `messages.py` | `HistItem`, reply-chain walking, thread prompt rendering, `send_chained_replies` (2000-char split), similarity check |
| `openrouter_client.py` | `chat_completion`: model resolution, `models` fallback chain (chosen + `OPENROUTER_TEXT/VISION_FALLBACK_MODELS` from `config.py`, max 3) so OpenRouter fails over server-side on upstream 429s/outages, 2 attempts with ≤3s sleep, 429 body logged, cache markers, billing by the model that actually answered |
| `model_catalog.py` | 10-minute cache of OpenRouter `/models` pricing (cost fallback only) |
| `usage.py` | `is_over_budget` (missing user counts as over budget) |
| `conversation_cache.py` | S3-backed reply-tree cache + in-memory index; **single-process only** |
| `appearance.py`, `thread_images.py`, `discord_images.py`, `s3_images.py` | Vision pipeline: portraits/attachments are turned into text `appearance` / `MSGIMG` descriptions |
| `guild_nickname.py` | Sets bot nickname to active character name(s), joined with ` & `, 32-char cap |
| `crypto_util.py` | AES-GCM decryption of per-user OpenRouter keys |
| `trust.json` | EC2 IAM AssumeRole trust policy (not app logic) |

**Message flow:**
1. The bot only responds when @mentioned or when someone replies to its message.
2. `resolve_runtime_configs` picks the character(s). In a DM it uses the user's `dmCharacterSlug`. In a guild it uses `activeCharacters` (up to 3, replying in order, 2s apart).
3. It gets the reply chain, from the conversation cache if possible, otherwise by walking Discord.
4. Thread length is capped at 100 bot messages.
5. Before generating, it checks the budget, loads memories, builds the prompt, and calls `chat_completion` with `session_id=anychar:<owner>:<slug>:<root>`. The `session_id` pins the provider so prompt caching stays warm.
6. A reply that is ≥90% similar to the previous one is regenerated once.
7. After sending, it writes a short-term memory summary, then records the turn in the S3 tree.

There are no webhooks: replies are normal bot messages, prefixed with `**Name**` when several characters are active.

## Web architecture (`web/src/`)

- `lib/auth.ts`: Discord provider with scopes `identify email guilds`. It needs `issuer: "https://discord.com"` (RFC 9207), so don't remove it.
- `lib/auth-adapter.ts`: custom DynamoDB Auth.js adapter using database sessions. `createUser` tries to auto-approve by provisioning an OpenRouter key. If that fails, the user stays pending until an admin approves them.
- `lib/users.ts` holds domain logic plus the `requireSession` / `requireApproved` / `requireAdmin` guards. `lib/dynamo.ts` is a thin DocumentClient wrapper. Other helpers: `lib/s3.ts`, `lib/crypto.ts`, `lib/openrouter.ts`, `lib/discord-bot.ts` (Discord REST: nicknames, name lookup), `lib/memories.ts`, `lib/appearance.ts`.
- Validation uses zod (`lib/schemas/character.ts`, `lib/schemas/memory.ts`). Known users: max 5 per character, and 500 characters each when there's more than one.
- Pages are under `app/`: landing, `about`, `pending`, `admin`, and `dashboard/{characters,servers,dm,settings}`. API routes are under `app/api/`.
- `lib/btc/`: Bitcoin deposits (see Behaviour notes). `config` (env), `wallet` (xpub → P2WPKH via `@scure/bip32`/`@scure/btc-signer`), `esplora` (mempool.space client), `price` (Coinbase → CoinGecko spot), `store` (DynamoDB records + crediting), `watcher` (poll loop), `scan` (central-wallet balance/UTXOs), `psbt` (unsigned withdrawals + broadcast), `dashboard` (deposit-card loader). `src/instrumentation.ts` starts the watcher in the Node runtime. Routes: `api/btc/{deposits,check}`, `api/admin/btc/{summary,psbt,broadcast}`. UI: `dashboard/bitcoin-deposit.tsx`, `admin/bitcoin-admin.tsx`.
- Styling is Tailwind v4 with CSS-variable theming in `app/globals.css` and no component library.
- `lib/prompt-builder.ts` mirrors bot prompt constants, but nothing imports it right now.

## Data model (DynamoDB table `AnyChar`, keys `pk`/`sk`, index `GSI1` on `gsi1pk`/`gsi1sk`)

| pk | sk | Entity |
|---|---|---|
| `USERS` | `USERID#{id}` | User: approved/admin, encrypted `openRouterApiKey`, usage/`budgetUsd`, `preferredTextModel`, `age18plus`, `dmCharacterSlug`. GSI1 `APPROVAL#approved\|pending` |
| `USERS` | `USERID#{owner}#CHAR#{slug}` | Character (`replyStyle`, `memoryLevel`, `adultCharacter`, `imageS3Key`, `appearance`, …) |
| `USERS` | `…#CHAR#{slug}#KNOWN#{userId}` | Known user (owner's own entry is auto-created and cannot be deleted) |
| `USERS` | `…#CHAR#{slug}#SERVER#{guildId\|DM}#MEMORY#…` / `#MEMORYLT#…` | Short-term / long-term memory |
| `USERS` | `USERID#{id}#GUILD#{guildId}` | Guild link (GSI1 `GUILD#{guildId}`) |
| `USERS` | `SESSION#…`, `USERID#…#ACCOUNT#…` | Auth.js records |
| `GUILDS` | `GUILDID#{guildId}` | Guild config: `activeCharacters` list (legacy single-character fields still written/read as fallback) |
| `GUILDS` | `{guildKey}#THREAD#{rootId}` / `{guildKey}#MSGIMG#{msgId}` | Thread counter / image-description index |
| `BTC` | `COUNTER#{xpubId}#receive` | Atomic next-receive-index counter |
| `BTC` | `USERADDR#{xpubId}#{userId}` | User's deposit address + derivation index, `watchUntil` (watcher priority) |
| `BTC` | `DEP#{xpubId}#{txid}:{vout}` | Deposit (`pending → crediting → credited`, or `dropped`), frozen `btcUsdPrice`/`usdCredited`. GSI1 `BTCDEP#{xpubId}#{userId}` / `detectedAt` |

- **Character SK gotcha:** both the bot and the web list characters with `begins_with` and keep only items whose slug part contains no `#`. Any new sub-item under a character must have a further `#` so it isn't mistaken for a character.
- **S3 layout:**
  - `characters/{owner}/{slug}/avatar.*`
  - `characters/{owner}/{slug}/known/{id}.*`
  - `conversations/{guilds/{gid}|dms/{uid}}/{rootId}.json`
- **IAM:** the EC2 role (`infra/iam-ec2-policy.json`) can Get/Put/Update/Delete/Query but **not Scan**.
- `xpubId` is a short hash of `BTC_XPUB`, so changing the xpub orphans existing addresses. User items gain `btcDepositedUsd` and the string set `btcCreditedOutpoints` (exactly-once guard). The bot ignores both.

## Invariants: keep bot and web in sync

These are duplicated across languages. When you change one side, change the other:
- **Starred model lists:** `DEFAULT_STARRED_MODEL_IDS` / `ADULT_STARRED_MODEL_IDS` in `bot/config.py` and `web/src/lib/models.ts`.
  - Adult picks must be unmoderated on OpenRouter and permissive at the model level.
  - The web drops moderated models from the starred set in adult mode.
- **Billing multiplier 2×:** `_BILLING_MULTIPLIER` in `bot/openrouter_client.py` and `BILLING_MULTIPLIER` in `web/src/lib/appearance.ts`.
- **Encryption:** AES-256-GCM, key = SHA-256(`ENCRYPTION_SECRET`).
  - Stored format: `enc:` + base64(iv12 + tag16 + ct).
  - `ENCRYPTION_SECRET` must be identical in `bot/.env` and `web/.env`.
  - The bot also accepts a legacy Python layout (iv + ct+tag) and plaintext without the prefix.
- **Vision/appearance prompts:** `web/src/lib/appearance.ts` mirrors `bot/appearance.py`.

## Behaviour notes

- **Adult content:** the user's `age18plus` attribute is set only through `POST /api/user/adult-content` (re-enabling requires `confirmedAdult === true`).
  - The bot uses `PLATFORM_CONTENT_POLICY` only when the owner has `age18plus` **and** the character has `adultCharacter: true`; otherwise `RESTRICTED_CONTENT_POLICY` (`main.py` → `prompt_builder.py`).
  - `adultCharacter` is a per-character checkbox in the editor/new form. The API only lets the owner change it while their adult content is on, and keeps the stored value otherwise.
  - `bot/scripts/mark_adult_characters.py [--dry-run]` was a one-time migration that marked all characters of the adult users who existed then.
  - Never relax the rule that bans sexual content involving under-18 characters.
- **Model resolution** (`_resolve_model`): explicit model → vision model → user's `preferredTextModel` → `OPENROUTER_DEFAULT_ADULT_TEXT_MODEL` (Mistral Large, if `age18plus`) → `OPENROUTER_DEFAULT_TEXT_MODEL` (Claude Sonnet 5.5). Web mirrors this via `defaultTextModel()` in `web/src/lib/models.ts`.
- **Prompt caching:** explicit `cache_control` markers are only added for `_EXPLICIT_CACHE_PREFIXES` / `_EXPLICIT_CACHE_EXACT` (anthropic/, qwen/, deepseek-v3.2). Other model families cache implicitly. Review this list when the model lineup changes.
- **Billing:** OpenRouter's `usage.cost` × 2 goes into `usageCostUsd`; catalog pricing is the fallback. The default budget is $10, and admins raise it through `/api/admin/raise-budget`.
- **Bitcoin deposits** (web only, off unless `BTC_XPUB` is set):
  - Watch-only custody: the server holds the central wallet's account xpub, never private keys. Each approved user gets a permanent receive address (`/0/{n}`, n from the atomic counter) shown with a QR on `/dashboard`, so deposits land directly in the admin's wallet.
  - The watcher (`instrumentation.ts`, every `BTC_POLL_INTERVAL_SECONDS`) checks addresses via mempool.space: "hot" ones (dashboard open / Check button) every cycle, unsettled ones always, the rest on a slow rotation. **Single-process assumption** like the bot's conversation cache; idempotent crediting makes a duplicate harmless, but don't run two web instances with the watcher on.
  - At `BTC_CONFIRMATIONS` (3), the deposit is credited at spot price (floored to cents) to `budgetUsd`: `pending → crediting` (price frozen) → user update guarded by `NOT contains(btcCreditedOutpoints, :op)` → `credited`. A stuck `crediting` item is safely retried. No price = no credit (retried next cycle).
  - Admin page: balance (all receive + change addresses), deposits, fee presets, "create unsigned transaction" (PSBT with BIP32 derivations from `BTC_MASTER_FINGERPRINT`/`BTC_ACCOUNT_PATH`; change → `/1/{j}`), and broadcast of a signed PSBT/raw tx. Use a dedicated wallet for deposits and raise its gap limit in Sparrow/Electrum.
  - Test offline with `cd web && npx tsx scripts/smoke-btc.ts` (BIP84 vectors + PSBT sign/finalize).
- **Memory compaction:** token estimate is chars/4. When a tier exceeds `st_max`/`lt_max` (5k/10k/20k for short/medium/long), the oldest items are LLM-summarised down to the keep size. Near-duplicate summaries are skipped.

## Config & secrets

- **Bot env** (`bot/.env`): `TOKEN`, `AWS_REGION`, `DYNAMODB_TABLE`, `S3_BUCKET`, `ENCRYPTION_SECRET`, `OPENROUTER_VISION_MODEL`, `OPENROUTER_DEFAULT_TEXT_MODEL`, `SITE_URL`, `BUDGET_EXCEEDED_MESSAGE`, `CONVERSATION_TTL_SECONDS`, `CONVERSATION_CLEANUP_INTERVAL_SECONDS`.
  - `bot/.env.example` is stale: it lists `OPENROUTER_TEXT_MODEL` / `OPENROUTER_MEMORY_MODEL`, which nothing reads, and is missing `OPENROUTER_DEFAULT_TEXT_MODEL`.
- **Web env** (`web/.env`): `AUTH_SECRET`, `AUTH_URL`, `AUTH_DISCORD_ID` (or `NEXT_PUBLIC_DISCORD_CLIENT_ID`), `AUTH_DISCORD_SECRET`, `DISCORD_BOT_TOKEN`, `AWS_REGION`, `DYNAMODB_TABLE`, `S3_BUCKET`, `ENCRYPTION_SECRET`, `OPENROUTER_MANAGEMENT_KEY`, optional `OPENROUTER_VISION_MODEL`. Optional Bitcoin: `BTC_NETWORK` (default testnet), `BTC_XPUB`, `BTC_MASTER_FINGERPRINT`, `BTC_ACCOUNT_PATH`, `BTC_CONFIRMATIONS`, `BTC_POLL_INTERVAL_SECONDS`, `BTC_WATCHER_ENABLED`, `BTC_EXPLORER_URL`, `BTC_ESPLORA_API_URL` (documented in `web/.env.example`). Local dev hits the production table, so keep `BTC_XPUB` empty or `BTC_WATCHER_ENABLED=false` locally.
- Per-user OpenRouter keys are stored encrypted in DynamoDB. There is no local OpenRouter key, so live LLM calls can't easily be tested locally.
- **Never commit:**
  - `.env` files
  - `*.pem` (including `BotServerKeyPair.pem` in the repo root)
  - `infra/deploy-ec2.sh`, which contains live tokens
  - Before `git add .`, check `git status` for stray root images and secrets.
- Bot invite permissions are `2416299008` and must include Change Nickname.
- **Production:** EC2 + pm2 + Caddy (`anychar.bot` → `localhost:3000`). Web changes need `npm run build` before restarting `anychar-web`; bot changes only need a restart of `anychar-bot`. See the `ec2-deploy` skill.
