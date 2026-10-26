#!/usr/bin/env bash
# Checks whether a Resend sending domain is actually able to send.
#
# Why this exists: no sending domain was verified for months, and because the
# Resend SDK reports a refusal in { error } rather than throwing, every
# password-reset mail was silently dropped while the app reported success. The
# only user-visible symptom was "invalid email or password" on the login page.
# Run this after changing DNS or the sender, and believe the last line only.
#
#   ./scripts/verify-email-domain.sh [domain]     (default: pitstops.work)

set -uo pipefail
DOMAIN="${1:-pitstops.work}"
ENV_FILE="$(dirname "$0")/../.env.local"

echo "== DNS for $DOMAIN =="
dkim=$(dig +short TXT "resend._domainkey.$DOMAIN")
spf=$(dig +short TXT "send.$DOMAIN")
mx=$(dig +short MX "send.$DOMAIN")

report() { # name value
  if [ -n "$2" ]; then printf '  %-28s present\n' "$1"; else printf '  %-28s MISSING\n' "$1"; fi
}
report "resend._domainkey (DKIM)" "$dkim"
report "send (SPF)" "$spf"
report "send (MX)" "$mx"

if [ -z "$dkim" ] || [ -z "$spf" ] || [ -z "$mx" ]; then
  echo
  echo "DNS is not in place yet, so sending cannot work. Add the records Resend"
  echo "shows at https://resend.com/domains. DNS for this domain is on GoDaddy —"
  echo "its Name field takes the RELATIVE host ('send', 'resend._domainkey'),"
  echo "never the full domain, or you silently create send.$DOMAIN.$DOMAIN."
  exit 1
fi

echo
echo "== live send probe (to Resend's sink, nobody receives this) =="
KEY=$(grep -E '^RESEND_API_KEY=' "$ENV_FILE" | sed 's/^RESEND_API_KEY=//; s/^"//; s/"$//' | tr -d '\n')
if [ -z "$KEY" ]; then echo "  no RESEND_API_KEY in .env.local"; exit 1; fi

body=$(curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"from\":\"noreply@$DOMAIN\",\"to\":\"delivered@resend.dev\",\"subject\":\"probe\",\"text\":\"probe\"}")

if printf '%s' "$body" | grep -q '"id"'; then
  echo "  SENDING WORKS from noreply@$DOMAIN"
  echo
  echo "Remaining: set RESEND_FROM_EMAIL=noreply@$DOMAIN in Vercel production"
  echo "and REDEPLOY — an env change alone does nothing."
else
  echo "  REFUSED: $body"
  exit 1
fi
