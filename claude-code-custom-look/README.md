# Claude Code の見た目のカスタマイズ

ターミナルで使う Claude Code の画面を、次の形に変える設定一式です。Claude にこの README を読ませて「この設定を入れて」と頼めば入ります（手で入れる場合も下の手順どおり）。

- **一番下の枠**：入力欄の下に、次の 2 つを入れた枠を出す
  - 左：Model（モデル・effort・thinking と、モデルのアイコン）／Branch／Git（未コミットの変更数・↑↓・stash）／PR／Session（経過時間・料金・変更行数）／Cache
  - 右：5 時間枠・1 週間枠・コンテキストの使用率を、点字の字で描いた輪で出す。リセット時刻付きで、80% 以上は赤
- **エージェント一覧**：エージェントを動かしている間だけ、モードの行（⏵⏵ auto mode on …）と一番下の枠の間に、次の内容を 1 行ずつ出す
  - モデルのアイコン（fable 🦄・opus 🐉・sonnet 🐺・haiku 🦇）・種類・モデル・説明「· 今していること」
  - 状態（● running など）・コンテキストのバー・トークン数・経過時間
- **メッセージの枠**：自分のメッセージを青、Claude の返答をオレンジの線で囲む（自分は左側だけ・Claude は右側だけ線を引く）

## 前提

- Claude Code 2.1.322 で作って動かした。mod（`~/.claude/mods/` などから読み込む画面の部品）の仕組みを使うので、mod が使える版であること
- `jq` と `git` が入っていること
- Linux（devcontainer など）で動かしている。ステータスラインのコマンドが GNU の `stat -c %Y` と `date -d` を使うので、macOS でそのまま使う場合は `settings/statusline.sh` の `stat -c %Y` を `stat -f %m` に直す
- VS Code のターミナルで、背景は黒（既定）を想定

## フォルダの中身

| ファイル | 役割 |
|---|---|
| `mod/` | 画面の部品（mod）。`~/.claude/mods/status-panel/` にそのまま置く |
| `mod/hooks/register.tsx` | 一番下の枠。ステータスラインが書いたファイルを 1 秒ごとに読んで描く |
| `mod/hooks/agents.tsx` | エージェント一覧 |
| `mod/hooks/frames.tsx` | メッセージの枠と、枠の線の描き方 |
| `settings/statusline.sh` | `~/.claude/settings.json` の `statusLine.command` に入れる中身。画面には何も出さず、Claude Code から受け取った値（とブランチ・git の状態）を `/tmp/claude-panel/<セッション ID>.json` に書く |
| `settings/subagent-statusline.sh` | `subagentStatusLine.command` に入れる中身。エージェントの情報を `/tmp/claude-panel/<セッション ID>.agents.json` に書き、元のエージェント一覧の行は空にして消す |
| `install.sh` | 下の「入れ方」を自動でするスクリプト |

## 入れ方

### Claude に頼む場合

Claude にこのフォルダの場所を伝えて、「この中の `README.md` を読んで、この設定を入れて」と頼む。Claude は次の順で進める。

1. `sh install.sh --dry-run` を流し、置き換わる設定（今の `statusLine`・`subagentStatusLine`・`env`）と入れたあとの値を見せて、入れてよいかを確かめる
2. よければ `sh install.sh` を流す
3. Claude Code を開き直してもらう（`/exit` してから `claude --continue` など）
4. 開き直したら、入力欄の下に枠が出ているかを見てもらう

### 手で入れる場合

```sh
sh install.sh --dry-run   # 何が変わるかを見る（何も書き換えない）
sh install.sh             # 入れる
```

`install.sh` がすること:

- `~/.claude/settings.json` の控え（`settings.json.bak-日時`）を取る
- 次の 3 つを書き換える。ほかの設定はそのまま残す
  - `statusLine`：`settings/statusline.sh` に置き換える
  - `subagentStatusLine`：`settings/subagent-statusline.sh` に置き換える
  - `env.CLAUDE_CODE_PLUGIN_DIRS`：`~/.claude/mods/status-panel` を足す。既にほかのフォルダがあれば `:` でつなぐ
- `mod/` を `~/.claude/mods/status-panel/` に置く。既にあれば `status-panel.bak-日時` に移してから置く

入れたら Claude Code を開き直す。`env` の設定は起動のときに読まれるので、開き直すまで反映されない。

## 確かめ方

- 入力欄の下（モードの行の下）に、Model から Cache までの 6 行と 3 つの輪が入った枠が出る
- 短いエージェントを動かしてもらうと、モードの行と枠の間に一覧が出る
- 自分のメッセージと Claude の返答が、青とオレンジの線で囲まれる

mod の検査と型チェック（直したときに使う）:

```sh
claude plugin validate ~/.claude/mods/status-panel
npx tsc -p ~/.claude/mods/status-panel/tsconfig.json   # 型は Claude Code が mod を読み込んだときに .claude-plugin/types/ に置く
```

## 好みで変えるところ

| 変えたいもの | 場所 |
|---|---|
| メッセージの枠の線の色 | `mod/hooks/frames.tsx` の `YOU_LINE`（青）・`CLAUDE_LINE`（オレンジ）。テーマの色名か `#rrggbb` |
| 枠の内側の背景色 | `frames.tsx` の `FRAME_BG`・`register.tsx` の `PANEL_BG`（今は黒 `#000000`） |
| モデルのアイコン | `mod/hooks/agents.tsx` の `MODEL_ICON` |
| 輪が縦長・横長に見える | `mod/hooks/register.tsx` の `ASP`（ターミナルの 1 マスの高さ÷幅。2.4 で作った。フォントや行の高さで変わる） |

`~/.claude/mods/status-panel/` のファイルを直して保存すると、開いているセッションにもすぐ反映される。

## 外し方

1. `~/.claude/settings.json` から `statusLine`・`subagentStatusLine`・`env.CLAUDE_CODE_PLUGIN_DIRS` を消す（または `install.sh` が取った控え `settings.json.bak-日時` に戻す）
2. `~/.claude/mods/status-panel/` を消す
3. Claude Code を開き直す

## 気をつけること

- **mod の仕組みはまだ試験段階**：Claude Code の更新で崩れることがある。崩れたら外し方の手順で戻せる
- **mod が無いと使用量が見えない**：ステータスラインは画面に何も出さない（mod に値を渡すだけ）。mod が読み込まれていないと、使用量が見えなくなる
- **エージェントの会話を開く操作が変わる**：元のエージェント一覧は消しているので、行を選んでそのエージェントの会話を開く操作は使えない。`/tasks` から開く
- **モードの行は動かせない**：モードの行（⏵⏵ auto mode on …）は Claude Code が描くので、枠の外（上）に出る
