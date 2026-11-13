import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { PanelData, Window } from '../types'
import { agentList, iconOf, readAgents } from './agents'
import { edgeFrame, registerFrames } from './frames'

// ステータスラインのコマンドが、受け取った値をここへ <session_id>.json で書く
const DIR = '/tmp/claude-panel'

const data = atom({ plugin: 'status-panel', key: 'data' } as const, null, { shape: 'panel-2' })
const now = atom({ plugin: 'status-panel', key: 'now' } as const, 0)
const agents = atom({ plugin: 'status-panel', key: 'agents' } as const, null, { shape: 'agents-1' })

// 入力欄の枠と同じ色（/color default で戻る色）。テーマの色名で指定し、テーマを変えても合わせる
const BORDER = 'promptBorder'
const LABEL = '#7f8ea8'
const TRACK = '#3a4560'
// 枠の内側の背景。ターミナルの背景と同じ黒
const PANEL_BG = '#000000'

// ---- 値の取り出し ----
type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
function win(v: unknown): Window | null {
  const o = obj(v)
  const pct = num(o.used_percentage)
  return pct === null ? null : { pct, resetsAt: num(o.resets_at) }
}

function parse(text: string, t: number): PanelData {
  const j = obj(JSON.parse(text))
  const cost = obj(j.cost)
  const cache = obj(j.prompt_cache)
  const pr = obj(j.pr)
  const rl = obj(j.rate_limits)
  return {
    sessionName: str(j.session_name),
    model: str(obj(j.model).display_name),
    effort: str(obj(j.effort).level),
    thinking: obj(j.thinking).enabled === true,
    fast: j.fast_mode === true,
    repo: str(obj(obj(j.workspace).repo).name),
    branch: str(j.branch),
    git: j.git && typeof j.git === 'object'
      ? { changed: num(obj(j.git).changed), ahead: num(obj(j.git).ahead), behind: num(obj(j.git).behind), stash: num(obj(j.git).stash) }
      : null,
    prNumber: num(pr.number),
    prState: str(pr.review_state),
    durationMs: num(cost.total_duration_ms),
    costUsd: num(cost.total_cost_usd),
    linesAdded: num(cost.total_lines_added),
    linesRemoved: num(cost.total_lines_removed),
    cacheWarm: typeof cache.warm === 'boolean' ? cache.warm : null,
    cacheExpiresAt: num(cache.expires_at),
    cacheHit: num(cache.hit_ratio),
    five: win(rl.five_hour),
    seven: win(rl.seven_day),
    context: num(obj(j.context_window).used_percentage),
    readAt: t,
  }
}

let lastText = ''
// 最後に「今の時刻」を進めた分（分単位）。秒を見せる必要が無いときは、分が変わったときだけ進める
let lastMinute = -1
// エージェント一覧を出している間は秒で進める（経過時間が秒で動き、15 秒で一覧を消すため）。少し余裕を見る
const AGENTS_SHOWN_SEC = 20

// ファイルは毎秒読む（変わったときだけ描き直す）。「今の時刻」は、秒が見えるとき（セッションの経過時間が 1 時間未満・エージェント一覧を出している）だけ毎秒、それ以外は 1 分ごとに進める
async function sync($: EngineInterface): Promise<void> {
  const t = await $.clock.now()
  const id = await $.session.id()
  let text: string | null = null
  try {
    text = await $.fs.read(`${DIR}/${id}.json`)
  } catch {
    text = null
  }
  if (text !== null && text !== lastText) {
    lastText = text
    try {
      const parsed = parse(text, t)
      await update($, data, () => parsed)
    } catch {
      // 書きかけなどで読めないときは前の値のまま
    }
  }
  const fresh = await readAgents($)
  if (fresh) {
    await update($, agents, () => fresh)
  }

  const d = await read($, data)
  const list = await read($, agents)
  const sessionMs = d && d.durationMs !== null ? d.durationMs + (t - d.readAt) : null
  const agentsShown = !!list && list.rows.length > 0 && t / 1000 - list.writtenAt <= AGENTS_SHOWN_SEC
  const needSeconds = agentsShown || (sessionMs !== null && sessionMs < 3_600_000)
  const minute = Math.floor(t / 60_000)
  if (needSeconds || minute !== lastMinute) {
    lastMinute = minute
    await update($, now, () => t)
  }
}

// ---- 輪（点字の字で描く。マスの高さを幅の 2.4 倍として真円に近づける） ----
const ASP = 2.4
const RH = 7
const RW = 2 * Math.floor((RH * ASP) / 2 + 0.5)
const BIT = [
  [1, 8],
  [2, 16],
  [4, 32],
  [64, 128],
]
type Run = { text: string; color: string; bold: boolean }

const hex2 = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
function mix(a: string, b: string, t: number): string {
  const x = hex2(a)
  const y = hex2(b)
  return '#' + x.map((v, i) => Math.round(v + ((y[i] ?? v) - v) * t).toString(16).padStart(2, '0')).join('')
}

function ring(pct: number, c1: string, c2: string, label: string, reset: string | null): Run[][] {
  const k = ASP / 2
  const R = Math.min(RW, 2 * RH * k) - 0.3
  const r = R - 3.2
  const cells: { ch: string; color: string; bold: boolean }[][] = []
  for (let row = 0; row < RH; row++) {
    const line: { ch: string; color: string; bold: boolean }[] = []
    for (let col = 0; col < RW; col++) {
      let bf = 0
      let bt = 0
      let sf = 0
      let nf = 0
      for (let dyc = 0; dyc < 4; dyc++) {
        for (let dxc = 0; dxc < 2; dxc++) {
          const dx = col * 2 + dxc + 0.5 - RW
          const dy = (row * 4 + dyc + 0.5 - 2 * RH) * k
          const d = Math.hypot(dx, dy)
          if (d < r || d > R) continue
          let a = Math.atan2(dx, -dy)
          if (a < 0) a += 2 * Math.PI
          const fr = a / (2 * Math.PI)
          const bit = BIT[dyc]?.[dxc] ?? 0
          if (fr < pct / 100) {
            bf += bit
            sf += fr
            nf++
          } else bt += bit
        }
      }
      if (bf) line.push({ ch: String.fromCodePoint(0x2800 + bf), color: mix(c1, c2, pct > 0 ? sf / nf / (pct / 100) : 0), bold: false })
      else if (bt) line.push({ ch: String.fromCodePoint(0x2800 + bt), color: TRACK, bold: false })
      else line.push({ ch: ' ', color: TRACK, bold: false })
    }
    cells.push(line)
  }
  const put = (row: number, text: string, color: string, bold: boolean) => {
    const chars = [...text]
    const c0 = Math.floor((RW - chars.length) / 2)
    chars.forEach((ch, i) => {
      const line = cells[row]
      if (line) line[c0 + i] = { ch, color, bold }
    })
  }
  put(2, label, '#9fb3d9', false)
  put(3, `${Math.round(pct)}%`, '#ffffff', true)
  if (reset) put(4, '↻' + reset, '#9fb3d9', false)
  // 同じ色・太さが続くところをまとめる
  return cells.map(line => {
    const runs: Run[] = []
    for (const c of line) {
      const last = runs[runs.length - 1]
      if (last && last.color === c.color && last.bold === c.bold) last.text += c.ch
      else runs.push({ text: c.ch, color: c.color, bold: c.bold })
    }
    return runs
  })
}

// ---- 表示用の文字 ----
const jst = (sec: number) => new Date((sec + 9 * 3600) * 1000)
const hhmm = (sec: number) => {
  const d = jst(sec)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
const mmdd = (sec: number) => {
  const d = jst(sec)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}
function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`
}
const PR_STATE: Record<string, { text: string; color: string }> = {
  pending: { text: '● Review pending', color: '#e5c07b' },
  approved: { text: '✓ Approved', color: '#23d18b' },
  changes_requested: { text: '● Changes requested', color: '#f14c4c' },
  commented: { text: '● Commented', color: '#7fd1ff' },
  merged: { text: '✓ Merged', color: '#c792ea' },
}

// リセット時刻を過ぎた枠・値が無い枠は 0% で出す
function live(w: Window | null, t: number): { pct: number; resetsAt: number | null } {
  if (!w || (w.resetsAt !== null && w.resetsAt * 1000 <= t)) return { pct: 0, resetsAt: null }
  return w
}

export const register: Register = on => {
  registerFrames(on)

  on('session.start', async ($, e, next) => {
    $.clock.every(1000, () => {
      void sync($)
    })
    void sync($)

    return next(e)
  })

  // 入力欄の下のヒントの行（モードの表示を含む Claude Code の行）の下に、エージェント一覧と使用量の枠を描く
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engine = await next(e)
    const d = await read($, data)
    if (!d) {
      return engine
    }
    const t = Math.max(await read($, now), d.readAt)
    const { Box, Text } = $.ui.resolve(e)

    const five = live(d.five, t)
    const seven = live(d.seven, t)
    const rings = [
      ring(five.pct, five.pct >= 80 ? '#ff3b3b' : '#1e6fff', five.pct >= 80 ? '#ff9a9a' : '#36d1ff', '5H', five.resetsAt ? hhmm(five.resetsAt) : null),
      ring(seven.pct, seven.pct >= 80 ? '#ff3b3b' : '#ff6b35', seven.pct >= 80 ? '#ff9a9a' : '#ffb36b', '7D', seven.resetsAt ? mmdd(seven.resetsAt) : null),
      ring(d.context ?? 0, (d.context ?? 0) >= 80 ? '#ff3b3b' : '#f5b300', (d.context ?? 0) >= 80 ? '#ff9a9a' : '#ffe57f', 'CTX', null),
    ]

    const row = (label: string, children: RenderChildren) => (
      <Box>
        <Box width={10} flexShrink={0}>
          <Text color={LABEL}>{label}</Text>
        </Box>
        <Box flexShrink={1}>{children}</Box>
      </Box>
    )

    const pr = d.prNumber !== null ? PR_STATE[d.prState ?? ''] : undefined
    const git = d.git
    const cacheLeft = d.cacheExpiresAt !== null ? Math.ceil((d.cacheExpiresAt * 1000 - t) / 60000) : null
    const cacheOn = d.cacheWarm === true && (cacheLeft === null || cacheLeft > 0)

    const agentView = agentList(Box, Text, await read($, agents), t, e.viewport?.columns ?? 120)

    return (
      <Box flexDirection="column">
        {engine}
        {agentView ? <Box marginTop={1}>{agentView}</Box> : null}
        <Box marginTop={1} marginBottom={2}>
        {edgeFrame(Box, Text, { color: BORDER, bg: PANEL_BG, left: true, right: true, padX: 1, body: (
        <Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {row(
            'Model',
            <Text>
              <Text bold color="#ffffff">
                {d.model ?? '-'}
              </Text>
              {d.model ? <Text>{` ${iconOf(d.model)}`}</Text> : null}
              {d.effort ? <Text color="#f5b300">{`  ${d.effort}`}</Text> : null}
              {d.thinking ? <Text color="#c792ea">{'  thinking'}</Text> : null}
              {d.fast ? <Text color="#ff8c42">{'  fast'}</Text> : null}
            </Text>,
          )}
          {row(
            'Branch',
            <Text wrap="truncate-end">
              <Text color="#ffffff">{d.repo ?? ''}</Text>
              {d.repo && d.branch ? <Text color={LABEL}>{' / '}</Text> : null}
              <Text color="#7fd1ff">{d.branch ?? ''}</Text>
            </Text>,
          )}
          {row(
            'Git',
            git && git.changed !== null ? (
              <Text>
                {git.changed > 0 ? (
                  <Text color="#e5c07b">{`● ${git.changed} changed`}</Text>
                ) : (
                  <Text color="#23d18b">{'✓ clean'}</Text>
                )}
                {git.ahead !== null && git.behind !== null ? (
                  <Text>
                    <Text color={git.ahead > 0 ? '#7fd1ff' : LABEL}>{`   ↑${git.ahead}`}</Text>
                    <Text color={git.behind > 0 ? '#d670d6' : LABEL}>{` ↓${git.behind}`}</Text>
                  </Text>
                ) : (
                  <Text color={LABEL}>{'   no upstream'}</Text>
                )}
                {git.stash ? <Text color={LABEL}>{`   stash ${git.stash}`}</Text> : null}
              </Text>
            ) : (
              <Text color={LABEL}>{'-'}</Text>
            ),
          )}
          {row(
            'PR',
            d.prNumber !== null ? (
              <Text>
                <Text color="#ffffff">{`#${d.prNumber}`}</Text>
                {pr ? <Text color={pr.color}>{`  ${pr.text}`}</Text> : <Text color={LABEL}>{`  ${d.prState ?? ''}`}</Text>}
              </Text>
            ) : (
              <Text color={LABEL}>{'none'}</Text>
            ),
          )}
          {row(
            'Session',
            <Text>
              <Text color="#ffffff">{d.durationMs !== null ? elapsed(d.durationMs + (t - d.readAt)) : '-'}</Text>
              <Text color={LABEL}>{'   Cost '}</Text>
              <Text color="#ffffff">{d.costUsd !== null ? `$${d.costUsd.toFixed(2)}` : '-'}</Text>
              <Text color={LABEL}>{'   Lines '}</Text>
              <Text color="#23d18b">{`+${d.linesAdded ?? 0}`}</Text>
              <Text color="#f14c4c">{` −${d.linesRemoved ?? 0}`}</Text>
            </Text>,
          )}
          {row(
            'Cache',
            cacheOn ? (
              <Text>
                <Text color="#23d18b">{'● Warm'}</Text>
                {cacheLeft !== null ? <Text color="#ffffff">{`  ${cacheLeft} min`}</Text> : null}
                {cacheLeft !== null ? <Text color={LABEL}>{' left'}</Text> : null}
                {d.cacheHit !== null ? <Text color={LABEL}>{'   Hit '}</Text> : null}
                {d.cacheHit !== null ? <Text color="#ffffff">{`${Math.round(d.cacheHit * 100)}%`}</Text> : null}
              </Text>
            ) : (
              <Text color={LABEL}>{'○ Cold'}</Text>
            ),
          )}
        </Box>
        <Box flexShrink={0}>
          {rings.map(rows => (
            <Box flexDirection="column" marginLeft={2}>
              {rows.map(runs => (
                <Text>
                  {runs.map(run => (
                    <Text color={run.color} bold={run.bold}>
                      {run.text}
                    </Text>
                  ))}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
        </Box>
        ) })}
        </Box>
      </Box>
    )
  })
}
