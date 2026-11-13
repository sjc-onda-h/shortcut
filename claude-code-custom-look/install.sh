#!/bin/sh
# Claude Code の見た目のカスタマイズ（使用量の枠・エージェント一覧・メッセージの枠）を入れる。
# 使い方: sh install.sh --dry-run   … 何を変えるかを表示するだけ（何も書き換えない）
#         sh install.sh             … 入れる（~/.claude/settings.json は控えを取ってから書き換える）
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"
MOD_DST="$CLAUDE_DIR/mods/status-panel"
STAMP=$(date +%Y%m%d%H%M%S)

for c in jq git; do
  command -v "$c" >/dev/null 2>&1 || { echo "必要なコマンドがありません: $c"; exit 1; }
done

current='{}'
[ -f "$SETTINGS" ] && current=$(cat "$SETTINGS")

# 足す設定: statusLine・subagentStatusLine を置き換え、env.CLAUDE_CODE_PLUGIN_DIRS に mod のフォルダを足す（既にほかのフォルダがあれば : でつなぐ）
merged=$(printf '%s' "$current" | jq \
  --rawfile sl "$HERE/settings/statusline.sh" \
  --rawfile sa "$HERE/settings/subagent-statusline.sh" \
  --arg dir "$MOD_DST" '
  .statusLine = {type: "command", command: $sl}
  | .subagentStatusLine = {type: "command", command: $sa}
  | ((.env.CLAUDE_CODE_PLUGIN_DIRS // "") as $cur
     | .env = ((.env // {}) + {CLAUDE_CODE_PLUGIN_DIRS:
         (if $cur == "" then $dir
          elif ($cur | split(":") | any(. == $dir)) then $cur
          else $cur + ":" + $dir end)}))')

echo "== 置き換える設定（今の値）"
printf '%s' "$current" | jq '{statusLine, subagentStatusLine, env: (.env // null)}'
echo "== 入れたあとの値（コマンドは先頭だけ）"
printf '%s' "$merged" | jq '{statusLine: (.statusLine | .command |= .[0:60] + "…"), subagentStatusLine: (.subagentStatusLine | .command |= .[0:60] + "…"), env}'
echo "== mod の置き場所: $MOD_DST"
[ -e "$MOD_DST" ] && echo "   既にあるので、$MOD_DST.bak-$STAMP に移してから置く"

if [ "$DRY" = 1 ]; then
  echo "（--dry-run なので何も書き換えていません）"
  exit 0
fi

mkdir -p "$CLAUDE_DIR/mods"
if [ -f "$SETTINGS" ]; then
  cp "$SETTINGS" "$SETTINGS.bak-$STAMP"
  echo "settings.json の控え: $SETTINGS.bak-$STAMP"
fi
printf '%s\n' "$merged" > "$SETTINGS.tmp-$STAMP" && mv "$SETTINGS.tmp-$STAMP" "$SETTINGS"

[ -e "$MOD_DST" ] && mv "$MOD_DST" "$MOD_DST.bak-$STAMP"
cp -R "$HERE/mod" "$MOD_DST"

echo "入れました。Claude Code を開き直すと反映されます。"
