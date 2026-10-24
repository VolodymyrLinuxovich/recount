#!/usr/bin/env bash
# Copy the Azure settings from a local env file into a Convex deployment. Keys are never printed.
#
#   scripts/set-azure-env.sh .env.azure                      # the deployment in CONVEX_DEPLOYMENT / .env.local
#   scripts/set-azure-env.sh .env.azure --prod               # production
#   CONVEX_DEPLOY_KEY=... scripts/set-azure-env.sh .env.azure   # whichever deployment the key is for
#
# .env.azure (gitignored by .env*) holds, from the Azure portal:
#   AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
#   AZURE_OPENAI_API_KEY=...
#   AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
#   AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
#   AZURE_SEARCH_ENDPOINT=https://<service>.search.windows.net
#   AZURE_SEARCH_KEY=...            (a query key is enough for the app; the index script needs an admin key)
#   AZURE_SEARCH_INDEX=recount-policies
#   AZURE_CONTENT_SAFETY_ENDPOINT=https://<resource>.cognitiveservices.azure.com
#   AZURE_CONTENT_SAFETY_KEY=...
# It also sets gpt-4.1-mini as the fallback for chat and letters (Claude stays first). Bill reading
# keeps Claude only.
set -euo pipefail
file="${1:?usage: set-azure-env.sh <env file> [convex env flags]}"
shift
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }

names=(AZURE_OPENAI_ENDPOINT AZURE_OPENAI_API_KEY AZURE_OPENAI_DEPLOYMENT AZURE_OPENAI_EMBEDDING_DEPLOYMENT AZURE_OPENAI_API_VERSION
       AZURE_SEARCH_ENDPOINT AZURE_SEARCH_KEY AZURE_SEARCH_INDEX AZURE_CONTENT_SAFETY_ENDPOINT AZURE_CONTENT_SAFETY_KEY)
for n in "${names[@]}"; do
  v="$(grep -E "^${n}=" "$file" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true)"
  if [ -n "$v" ]; then
    npx convex env set "$@" "$n" "$v" >/dev/null && echo "set $n"
  fi
done
if grep -qE '^AZURE_OPENAI_API_KEY=.' "$file"; then
  for t in CHAT LETTERS; do
    npx convex env set "$@" "MODEL_${t}_FALLBACK_PROVIDER" azure >/dev/null && echo "set MODEL_${t}_FALLBACK_PROVIDER=azure"
  done
fi
echo "done. Check with: npx convex run pipeline:map $*"
