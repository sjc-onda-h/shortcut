import type { Elements, EngineInterface, RenderElement } from 'claude-code'

import type { AgentList, AgentRow } from '../types'

// subagentStatusLine のコマンドが、受け取ったエージェントの情報をここへ <session_id>.agents.json で書く（元の一覧の行は空にして消している）
const DIR = '/tmp/claude-panel'
// エージェントが全部終わるとコマンドが呼ばれなくなるので、この秒数より古いファイルは出さない
const STALE_SEC = 15

const LABEL = '#7f8ea8'
const TRACK = '#3a4560'
// アイコンはエージェントが動いているモデルで決める（モデル名の最初の語）。モデルがまだ分からないときは 👾
const MODEL_ICON: Record<string, string> = {
  fable: '🦄',
  opus: '🐉',
  sonnet: '🐺',
  haiku: '🦇',
}
export const iconOf = (model: string) => MODEL_ICON[(model.split(' ')[0] ?? '').toLowerCase()] ?? '👾'
const STATUS: Record<string, { text: string; color: string }> = {
  running: { text: '● running', color: '#e5c07b' },
  completed: { text: '✓ done', color: '#23d18b' },
  failed: { text: '✕ failed', color: '#f14c4c' },
  killed: { text: '– stopped', color: '#8a8a8a' },
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

// claude-opus-5-5 → opus 5.5、claude-haiku-4-5-20251001 → haiku 4.5
function shortModel(id: string): string {
  const parts = id.replace(/^claude-/, '').split('-')
  const name = parts[0] ?? ''
  const ver = parts.slice(1).filter(p => /^\d{1,2}$/.test(p)).slice(0, 2).join('.')
  return name === '' ? '' : ver ? `${name} ${ver}` : name
}

function parse(raw: string): AgentList {
  const j = obj(JSON.parse(raw))
  const tasks = Array.isArray(j.tasks) ? j.tasks : []
  const rows: AgentRow[] = tasks.map(v => {
    const t = obj(v)
    return {
      id: text(t.id),
      type: text(t.agentType) || text(t.name) || text(t.type) || '?',
      desc: text(t.description),
      label: text(t.label),
      status: text(t.status),
      model: shortModel(text(t.model)),
      tokens: num(t.tokenCount),
      ctx: num(t.contextWindowSize),
      startTime: num(t.startTime),
    }
  })
  return { rows, writtenAt: num(j.writtenAt) ?? 0 }
}

let lastRaw = ''

// ファイルが前回から変わっていれば、読み取った一覧を返す。変わっていない・読めないときは null
export async function readAgents($: EngineInterface): Promise<AgentList | null> {
  const id = await $.session.id()
  let raw: string | null = null
  try {
    raw = await $.fs.read(`${DIR}/${id}.agents.json`)
  } catch {
    raw = null
  }
  if (raw === null || raw === lastRaw) return null
  lastRaw = raw
  try {
    return parse(raw)
  } catch {
    // 書きかけなどで読めないときは前の値のまま
    return null
  }
}

const tok = (n: number) => (n >= 1_000_000 ? `${(Math.floor(n / 100_000) / 10).toFixed(1)}M` : n >= 1000 ? `${(Math.floor(n / 100) / 10).toFixed(1)}k` : `${n}`)
function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const ctxColor = (p: number) => (p >= 80 ? '#ff3b3b' : '#f5b300')

type TBox = Elements['terminal']['Box']
type TText = Elements['terminal']['Text']

// 使用量の枠と同じ見た目の一覧。出すものが無いときは null
export function agentList(Box: TBox, Text: TText, list: AgentList | null, nowMs: number, cols: number): RenderElement | null {
  if (!list || list.rows.length === 0 || nowMs / 1000 - list.writtenAt > STALE_SEC) return null
  const wide = cols >= 100

  return (
    <Box flexDirection="column">
      {list.rows.map(a => {
        const st = STATUS[a.status] ?? { text: a.status, color: LABEL }
        const doing = a.status === 'running' && a.label !== '' && a.label !== a.desc ? a.label : ''
        const pct = a.ctx && a.tokens !== null ? Math.round((a.tokens * 100) / a.ctx) : null
        const eighths = pct !== null ? Math.round((Math.min(pct, 100) / 100) * 80) : 0
        const full = Math.floor(eighths / 8)
        const part = eighths % 8
        const filled = '█'.repeat(full) + (part > 0 ? ('▏▎▍▌▋▊▉'[part - 1] ?? '') : '')
        const track = '─'.repeat(10 - full - (part > 0 ? 1 : 0))
        return (
          <Box>
            <Box width={3} flexShrink={0}>
              <Text>{iconOf(a.model)}</Text>
            </Box>
            <Box width={29} flexShrink={0}>
              <Text wrap="truncate-end">
                <Text bold color="#ffffff">
                  {a.type}
                </Text>
                <Text color={LABEL}>{a.model ? ` ${a.model}` : ''}</Text>
              </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">
                <Text color="#c8ccd4">{a.desc}</Text>
                <Text color={LABEL}>{doing ? ' · ' : ''}</Text>
                <Text color="#7fd1ff">{doing}</Text>
              </Text>
            </Box>
            <Box width={12} flexShrink={0} marginLeft={1}>
              <Text color={st.color}>{st.text}</Text>
            </Box>
            {wide ? (
              <Box width={28} flexShrink={0}>
                <Text>
                  <Text color={LABEL}>{'CTX '}</Text>
                  {pct !== null ? <Text color={ctxColor(pct)}>{filled}</Text> : null}
                  <Text color={TRACK}>{pct !== null ? track : '          '}</Text>
                  <Text color={pct !== null ? ctxColor(pct) : LABEL}>{pct !== null ? `${pct}%`.padStart(5) : '     '}</Text>
                  <Text color={LABEL}>{a.tokens !== null ? tok(a.tokens).padStart(9) : ''}</Text>
                </Text>
              </Box>
            ) : null}
            <Box width={8} flexShrink={0} justifyContent="flex-end">
              <Text color={LABEL}>{a.startTime !== null ? elapsed(nowMs - a.startTime) : ''}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
