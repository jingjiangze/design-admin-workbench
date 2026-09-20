#!/usr/bin/env bash
# gh-api.sh — 本地 GitHub API 工具（零点击，零弹窗）
# 凭据来源：Windows 凭据管理器中 jingjiangze 的 PAT（git credential 机制，一次授权永久生效）
# 用法: bash scripts/gh-api.sh <METHOD> <api-path> [body-file]
#   例: bash scripts/gh-api.sh GET "/repos/jingjiangze/design-admin-workbench/commits?per_page=5"
#   例: bash scripts/gh-api.sh GET "/repos/jingjiangze/design-admin-workbench/contents/README.md"
# 安全: 令牌只在进程内流转，绝不打印、绝不落盘
set -euo pipefail

# 切到仓库根目录，确保 git 凭据配置（仓库级 credential.helper）生效
cd "${0%/*}/.." || exit 1

METHOD="${1:-GET}"
API_PATH="${2:-}"
BODY_FILE="${3:-}"

if [ -z "$API_PATH" ]; then
  echo "usage: gh-api.sh <METHOD> <api-path> [body-file]" >&2
  exit 2
fi

TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | GCM_INTERACTIVE=never git credential fill 2>/dev/null | sed -n 's/^password=//p')
if [ -z "$TOKEN" ]; then
  echo "NO_TOKEN: 凭据管理器中没有 github.com 的有效凭据" >&2
  exit 1
fi

ARGS=(-sS --ssl-no-revoke -m 30 -X "$METHOD"
      -H "Authorization: Bearer $TOKEN"
      -H "Accept: application/vnd.github+json")
if [ -n "$BODY_FILE" ]; then
  ARGS+=(-d @"$BODY_FILE")
fi

curl "${ARGS[@]}" "https://api.github.com$API_PATH"
