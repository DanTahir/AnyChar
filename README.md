# AnyChar

Multi-tenant Discord bot with DynamoDB-backed character profiles and a Next.js admin console.

## Structure

- `bot/` — Python Discord bot (discord.py, OpenRouter, DynamoDB, S3)
- `web/` — TypeScript Next.js dashboard (Auth.js Discord OAuth)
- `infra/` — AWS setup scripts for DynamoDB + S3 + IAM policy

## AWS setup

1. Configure AWS CLI credentials or attach `infra/iam-ec2-policy.json` to your EC2 instance role.
2. Run:

```bash
chmod +x infra/setup-aws.sh
./infra/setup-aws.sh
```

3. Seed your first admin in DynamoDB (replace `YOUR_DISCORD_ID`):

```json
{
  "pk": "USERS",
  "sk": "USERID#YOUR_DISCORD_ID",
  "discordId": "YOUR_DISCORD_ID",
  "approved": true,
  "admin": true,
  "gsi1pk": "APPROVAL#approved",
  "gsi1sk": "USERID#YOUR_DISCORD_ID",
  "usageInputTokens": 0,
  "usageOutputTokens": 0
}
```

## Bot

```bash
cd bot
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # fill TOKEN, AWS_*, S3_BUCKET, ENCRYPTION_SECRET
python main.py
```

## Web

```bash
cd web
npm ci
cp .env.example .env          # fill AUTH_*, DISCORD_*, AWS_*, ENCRYPTION_SECRET, OPENROUTER_MANAGEMENT_KEY
npm run build
npm start
```

## Production (EC2 + pm2 + Caddy)

1. Clone repo on EC2; configure `bot/.env` and `web/.env`.
2. Build web: `cd web && npm ci && npm run build`.
3. Start: `pm2 start ecosystem.config.json` from repo root.
4. Point Caddy/nginx at `localhost:3000` with TLS.
5. Set `AUTH_URL=https://your-domain.com` and matching Discord OAuth redirect.

## Discord

See the project plan for full Discord Developer Portal setup (OAuth redirects, bot invite with permissions `2416299008`, Message Content Intent).

Bot invite permissions include **Change Nickname** so the bot can set its server nickname to the active character name. If the bot was invited with an older link, re-invite using the dashboard link or:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APP_ID&permissions=2416299008&scope=bot%20applications.commands
```

## OpenRouter

- Set `OPENROUTER_MANAGEMENT_KEY` on the web server for admin user approval (auto-provisions per-user keys).
- Each approved user gets an encrypted key in DynamoDB; the bot decrypts with `ENCRYPTION_SECRET`.
