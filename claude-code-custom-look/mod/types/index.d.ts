// 枠に出す値。ステータスラインのコマンドが書いたファイル（受け取った値＋ブランチ）から取り出す
export type Window = { pct: number; resetsAt: number | null }

// まだコミットしていない変更のファイル数・追跡先より進んでいる／遅れているコミット数（追跡先が無ければ null）・stash の数
export type GitState = { changed: number | null; ahead: number | null; behind: number | null; stash: number | null }

export type PanelData = {
  sessionName: string | null
  model: string | null
  effort: string | null
  thinking: boolean
  fast: boolean
  repo: string | null
  branch: string | null
  git: GitState | null
  prNumber: number | null
  prState: string | null
  durationMs: number | null
  costUsd: number | null
  linesAdded: number | null
  linesRemoved: number | null
  cacheWarm: boolean | null
  cacheExpiresAt: number | null
  cacheHit: number | null
  five: Window | null
  seven: Window | null
  context: number | null
  // ファイルの中身が変わったのを見つけた時刻（ミリ秒）。経過時間をこの後も進めるために使う
  readAt: number
}

// エージェント一覧の 1 行。subagentStatusLine のコマンドが書いたファイル（tasks）から取り出す
export type AgentRow = {
  id: string
  type: string
  desc: string
  label: string
  status: string
  model: string
  tokens: number | null
  ctx: number | null
  startTime: number | null
}

// 最後にファイルが書かれた時刻（秒）。エージェントが全部終わるとコマンドが呼ばれなくなるので、古ければ一覧を消す
export type AgentList = { rows: AgentRow[]; writtenAt: number }

declare module 'claude-code' {
  interface PluginState {
    'status-panel': { data: Shaped<PanelData | null>; now: number; agents: Shaped<AgentList | null> }
  }
}
