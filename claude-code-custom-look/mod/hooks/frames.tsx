import type { Elements, On, RenderChildren, RenderElement } from 'claude-code'

// 自分のメッセージと Claude の返答を、片側の開いた枠で囲む。どちらもテーマの色名で指定し、テーマを変えても合わせる
// 自分のメッセージは /color blue と同じ青（テーマのエージェント用の 8 色の青）、Claude の返答は Claude のオレンジ
const YOU_LINE = 'blue_FOR_SUBAGENTS_ONLY'
const CLAUDE_LINE = 'claude'
// 枠の内側の背景。どちらも線の色を黒に 10% 混ぜた色。自分のメッセージは青（#5f87ff として計算）、Claude の返答はオレンジ（#d77757）
const YOU_BG = '#0a0e1a'
const CLAUDE_BG = '#160c09'

export function registerFrames(on: On): void {
  // 入力欄から送ったメッセージだけ。左の線、右は開ける。ラベルは付けない
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer') {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    return frame(Box, Text, { color: YOU_LINE, bg: YOU_BG, side: 'left', body: <Text>{e.props.text}</Text> })
  })

  // Claude の返答。右の線、左は開ける。ラベルは付けない
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary) {
      return next(e)
    }
    const { Box, Markdown, Text } = $.ui.resolve(e)
    return frame(Box, Text, { color: CLAUDE_LINE, bg: CLAUDE_BG, side: 'right', body: <Markdown text={e.props.text} /> })
  })
}

type TBox = Elements['terminal']['Box']
type TText = Elements['terminal']['Text']

// 枠の線のマスもグレーで塗り、線はマスの外側の端に描かれる細い線（上 ▔・下 ▁・左 ▏・右 ▕）にする。
// グレーは線のところで止まって外にはみ出さず、線と中身の間には線のマスの分のすき間が残る
// 横の線と縦の線は長めに書いて、はみ出た分を外側の Box で切り落とす
export function edgeFrame(
  Box: TBox,
  Text: TText,
  parts: { color: string; bg: string; left: boolean; right: boolean; padX: number; body: RenderChildren },
): RenderElement {
  const hline = (ch: string) => (
    <Box flexGrow={1} height={1} overflow="hidden">
      <Text color={parts.color}>{ch.repeat(400)}</Text>
    </Box>
  )
  const vline = (ch: string) => <Text color={parts.color}>{Array.from({ length: 400 }, () => ch).join('\n')}</Text>
  // 角は、マスの 2 つの端に線がある字（左上 🭽 U+1FB7D・右上 🭾 U+1FB7E・左下 🭼 U+1FB7C・右下 🭿 U+1FB7F）で上下の線と縦の線をつなぐ
  const corner = (ch: string) => <Text color={parts.color}>{ch}</Text>

  return (
    <Box flexDirection="column" flexGrow={1} backgroundColor={parts.bg}>
      <Box>
        {parts.left ? corner('🭽') : null}
        {hline('▔')}
        {parts.right ? corner('🭾') : null}
      </Box>
      <Box overflow="hidden" flexGrow={1} paddingLeft={parts.left ? 1 : 0} paddingRight={parts.right ? 1 : 0}>
        <Box flexGrow={1} paddingX={parts.padX}>
          {parts.body}
        </Box>
        {parts.left ? (
          <Box position="absolute" top={0} left={0}>
            {vline('▏')}
          </Box>
        ) : null}
        {parts.right ? (
          <Box position="absolute" top={0} right={0}>
            {vline('▕')}
          </Box>
        ) : null}
      </Box>
      <Box>
        {parts.left ? corner('🭼') : null}
        {hline('▁')}
        {parts.right ? corner('🭿') : null}
      </Box>
    </Box>
  )
}

// 片側だけ線のある枠（メッセージ用）。メッセージ同士がくっつかないよう、枠の上に 1 行空ける
function frame(
  Box: TBox,
  Text: TText,
  parts: { color: string; bg: string; side: 'left' | 'right'; body: RenderChildren },
): RenderElement {
  return (
    <Box marginTop={1} flexGrow={1}>
      {edgeFrame(Box, Text, {
        color: parts.color,
        bg: parts.bg,
        left: parts.side === 'left',
        right: parts.side === 'right',
        padX: 1,
        body: parts.body,
      })}
    </Box>
  )
}
