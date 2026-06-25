#!/usr/bin/env bash
set -euo pipefail
DISCORD_ID="1469190099781816525"
cd ~/AnyChar/web
MGMT=$(grep '^OPENROUTER_MANAGEMENT_KEY=' .env | cut -d= -f2-)
SECRET=$(grep '^ENCRYPTION_SECRET=' .env | cut -d= -f2-)
RESP=$(curl -s -X POST https://openrouter.ai/api/v1/keys \
  -H "Authorization: Bearer $MGMT" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"anychar-$DISCORD_ID\"}")
KEY=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('key') or d.get('data',{}).get('key',''))" <<<"$RESP")
KEYID=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('hash','$DISCORD_ID'))" <<<"$RESP")
if [ -z "$KEY" ]; then echo "OpenRouter failed: $RESP"; exit 1; fi
ENC=$(SECRET="$SECRET" PLAIN="$KEY" python3 <<'PY'
import os, base64, hashlib, secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
key = hashlib.sha256(os.environ["SECRET"].encode()).digest()
iv = secrets.token_bytes(12)
ct = AESGCM(key).encrypt(iv, os.environ["PLAIN"].encode(), None)
print("enc:" + base64.b64encode(iv + ct).decode())
PY
)
aws dynamodb update-item --table-name AnyChar --region us-east-1 \
  --key "{\"pk\":{\"S\":\"USERS\"},\"sk\":{\"S\":\"USERID#$DISCORD_ID\"}}" \
  --update-expression "SET approved = :a, admin = :adm, gsi1pk = :gpk, openRouterApiKey = :k, openRouterKeyId = :kid, usageInputTokens = :z, usageOutputTokens = :z2" \
  --expression-attribute-values "{\":a\":{\"BOOL\":true},\":adm\":{\"BOOL\":true},\":gpk\":{\"S\":\"APPROVAL#approved\"},\":k\":{\"S\":\"$ENC\"},\":kid\":{\"S\":\"$KEYID\"},\":z\":{\"N\":\"0\"},\":z2\":{\"N\":\"0\"}}"
echo "Admin setup complete for $DISCORD_ID"
