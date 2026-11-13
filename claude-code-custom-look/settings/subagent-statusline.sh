input=$(cat)
id=$(printf '%s' "$input" | jq -r '.session_id // "unknown"')
mkdir -p /tmp/claude-panel
printf '%s' "$input" | jq -c --argjson t "$(date +%s)" '. + {writtenAt: $t}' > "/tmp/claude-panel/$id.agents.json.tmp" && mv -f "/tmp/claude-panel/$id.agents.json.tmp" "/tmp/claude-panel/$id.agents.json"
printf '%s' "$input" | jq -c '.tasks[]? | {id, content: ""}'