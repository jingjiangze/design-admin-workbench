#!/usr/bin/env bash
# Standardized push entry - fixes TLS revocation check + silent credentials + anti-stall
# Usage: bash scripts/sync-push.sh [branch]   (default: current branch)
set -u
TOP="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$TOP" ]; then TOP="$(cd "${0%/*}/.." && pwd)"; fi
cd "$TOP" || exit 1
export PATH="/c/Users/Administrator/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd:/usr/bin:/bin:$PATH"
export http_proxy= https_proxy= HTTP_PROXY= HTTPS_PROXY= GCM_INTERACTIVE=never
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
ok=0
for i in 1 2 3; do
  if git -c http.sslVerify=false -c http.version=HTTP/1.1 push origin "$BRANCH" 2>&1; then
    ok=1; break
  fi
  sleep 3
done
if [ $ok -eq 1 ]; then echo "SYNC_PUSH_OK branch=$BRANCH"; else echo "SYNC_PUSH_FAILED branch=$BRANCH"; exit 1; fi
