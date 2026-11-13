input=$(cat)
id=$(printf '%s' "$input" | jq -r '.session_id // empty')
[ -n "$id" ] || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // "."')
d=/tmp/claude-panel
mkdir -p "$d"
br=$(git -C "$cwd" branch --show-current 2>/dev/null)
g="$d/$id.git"
now=$(date +%s)
if [ ! -f "$g" ] || [ $((now - $(stat -c %Y "$g"))) -ge 10 ]; then
  if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    ch=$(git -C "$cwd" status --porcelain 2>/dev/null | wc -l)
    ab=$(git -C "$cwd" rev-list --left-right --count '@{u}...HEAD' 2>/dev/null)
    st=$(git -C "$cwd" stash list 2>/dev/null | wc -l)
    printf '%s %s %s\n' "$ch" "${ab:-- -}" "$st" > "$g"
  else
    echo '- - - -' > "$g"
  fi
fi
set -- $(cat "$g")
printf '%s' "$input" | jq -c --arg br "$br" --arg ch "$1" --arg bh "$2" --arg ah "$3" --arg st "$4" '. + {branch: $br, git: {changed: ($ch | tonumber? // null), behind: ($bh | tonumber? // null), ahead: ($ah | tonumber? // null), stash: ($st | tonumber? // null)}}' > "$d/$id.json.tmp" && mv -f "$d/$id.json.tmp" "$d/$id.json"