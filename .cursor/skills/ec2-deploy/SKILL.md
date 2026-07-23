---
name: ec2-deploy
description: >-
  Update and deploy the AnyChar bot + Next.js web app to the EC2 host over SSH,
  and run git on this Windows/PowerShell repo. Use when committing changes,
  pushing, pulling on the server, rebuilding the web app, restarting pm2
  processes, or running a diagnostic command on the live bot.
---

# EC2 deploy + git workflow (AnyChar)

How to ship changes to the live AnyChar host and handle the Windows/PowerShell
git gotchas.

## Host

```
ssh -i "c:\all\projects\BotServerKeyPair.pem" -o StrictHostKeyChecking=no ec2-user@100.53.190.85
```

- Repo on server: `~/AnyChar` (git remote `main`).
- pm2 apps: `anychar-bot` (Python, `bot/`) and `anychar-web` (Next.js, `web/`).
- Node/npm/pm2 come from nvm — source it before using them:
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`
- TLS via Caddy (`anychar.bot` → `localhost:3000`).

## Standard deploy (after pushing to git)

1. Commit + push locally (see git section).
2. On the server: pull, rebuild web if web changed, restart the affected app(s).

Web change deploy (one shot):

```powershell
ssh -i "c:\all\projects\BotServerKeyPair.pem" -o StrictHostKeyChecking=no ec2-user@100.53.190.85 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; cd ~/AnyChar && git pull && cd web && npm run build && cd ~/AnyChar && pm2 restart anychar-web && sleep 3 && curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/'
```

Bot change deploy:

```powershell
ssh -i "c:\all\projects\BotServerKeyPair.pem" -o StrictHostKeyChecking=no ec2-user@100.53.190.85 'cd ~/AnyChar && git pull && pm2 restart anychar-bot'
```

Notes:
- Do `git pull` and the build/restart as **one** ssh command (wrap in single
  quotes). nvm sourcing doesn't persist between separate ssh calls.
- Web needs a fresh `npm run build` before `pm2 restart anychar-web` to pick up
  changes; the bot just needs a restart.
- After web deploy, `sleep` a few seconds before `curl` — the server needs time
  to come back up (otherwise HTTP 000).
- Logs: `pm2 logs anychar-bot --lines 100` / `pm2 logs anychar-web`.

## Running a one-off diagnostic on the live bot

The EC2 IAM role allows DynamoDB `Query`/`GetItem` but **not** `Scan`. To
inspect data using the bot's own helpers, run a small script via the bot venv:

```
ssh ... 'cd ~/AnyChar/bot && .venv/bin/python - <<PY
import dynamo
print(dynamo.get_character("<ownerId>", "<slug>"))
PY'
```

If you `scp` a temp/debug file to the server, it becomes an uncommitted change
that blocks the next `git pull`. Clean it up first:
`git checkout -- <file>` (or `rm` the temp file) before pulling.

## Git on Windows / PowerShell

- PowerShell does **not** support `&&`. Chain with `;` (runs sequentially
  regardless of failure) — e.g. `git add -A; git commit -m "msg"; git push`.
- Multiline commit messages: PowerShell heredocs are painful. Write the message
  to a temp file and use `git commit -F`:
  ```powershell
  # write message to .git/COMMIT_EDITMSG_TMP, then:
  git commit -F .git/COMMIT_EDITMSG_TMP; Remove-Item .git/COMMIT_EDITMSG_TMP
  ```
- Never use interactive flags (`git rebase -i`, `git add -i`) — they hang.
- `git log`/`git diff` can open a pager and hang the agent terminal; append
  `| cat` or use `--no-pager` (e.g. `git --no-pager log -n 20`).

## Secrets — do not commit

- `infra/deploy-ec2.sh` holds live tokens (bot token, Discord secret,
  OpenRouter management key) and is **gitignored**. Never force-add it.
- The SSH key `c:\all\projects\BotServerKeyPair.pem` and any `*.pem` are
  gitignored too.
- Before a broad `git add .`, check `git status` for stray secrets / loose
  images in the repo root.
