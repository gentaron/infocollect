# Hyperfleet｜無料優先の専門ツール・リポジトリ台帳

**調査候補：284件。** 「使える」・「本人が使った」・「GitHubに実装済み」は別です。

## 何をどこへ導入するか

| 領域 | 既存基盤 | 無料・OSS拡張の候補 | 採用ゲート |
|---|---|---|---|
| 司令塔 | agent-runner / OpenCode、判断SLM | コーディング指示のみ | オーケストレーターに重いRAGや研究処理を追加しない |
| 知識・調査 | infocollect KB / RSS | PierrotKnowledge2、FreshRSS、Docling、Meilisearch | 公開出典と来歴、シークレット隔離 |
| 企画 | IDEAZ | SkillCollection、RAG、テーマ照合 | 既出除外・独立根拠と形式検証 |
| 動画・音声・画像 | VAIZ / FFmpeg / ffprobe | FilmCraft、Irodori、whisper.cpp、Piper、Blender | 編集可能性・動画出力・権利確認・料金ゼロ |
| クオンツ | QAIZ | DuckDB、Polars、Pandera、PyMC | PIT検証、リーケージ検査、独立OOS |
| 数理物理 | Mathematical-Physics-Lab- | Lean4、SymPy、SageMath、Hypothesis、Z3 | 厳密計算・台帳・反証と証明の区別 |
| 文書 | presentationgen | PptxGenJS、Marp、Slidev | 出力物再読込・描画・内容照合 |

## 料金と状態のルール

**無料前提:** 有料API・追加GPU・有料クラウド・自動購入・実行環境の無断増強は一切しません。OSSでもモデルの計算資源は別途必要です。無料枠の終了・制限・商用利用条件は都度確認します。

- **existing-capability-observed**: このGitHubリポジトリ内に当該能力の既存コードがある。
- **staged-in-draft-pr**: ドラフトPRの中に実装したが未マージ。
- **catalog-only**: 調査・候補に留まり、まだ実装・インストールしていない。
- **reported_active / reported_historical / reported_stopped**: ユイマル本人の各記事での言及時点の状態。実機での第三者確認ではない。
- **not_confirmed**: 私たちが追加提案した候補。本人が使っていないとは断定できない。

## 一次資料
- N12: [2026-11-12 環境構成の再整理](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac)
- M30: [2026-05-30 OSS使用環境の棚卸し](https://note.com/humble_bobcat51/n/na35caa6136b7)
- J22: [2026-07-22 OpenCodeの構成](https://note.com/humble_bobcat51/n/nc3960d322fdb)
- M23: [2026-03-23 Claude Code拡張の整理](https://note.com/humble_bobcat51/n/ndf5aba8a5022)
- AWESOME: [無料ツールの比較紹介（導入実績ではない）](https://note.com/humble_bobcat51/n/n55bf6a004255)
- REM: [REMのOSS調査・紹介（使用を主張しない）](https://note.com/humble_bobcat51/n/naa276858275e)

## 全ツール・ソースリンク・導入条件

| ID | ツール（公式候補リンク） | 領域 | 根拠時点 | 所属先 | 料金種別 | 艦隊での状態 |
|---|---|---|---|---|---|---|
| T001 | [OpenCode](https://github.com/anomalyco/opencode) | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | open-source-self-host-or-review | existing-capability-observed |
| T002 | [Claude Code](https://github.com/anthropics/claude-code) | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | not-zero-cost-by-default | catalog-only |
| T003 | [Codex](https://github.com/openai/codex) | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | not-zero-cost-by-default | catalog-only |
| T004 | [OpenRouter](https://openrouter.ai/) | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | limited-free-quota | existing-capability-observed |
| T005 | NVIDIA AI API | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | none | limited-free-quota | catalog-only |
| T006 | [Strata](https://github.com/Niko1221/Strata) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | open-source-self-host-or-review | catalog-only |
| T007 | [4gbVramStrata](https://github.com/RandoTeam/4gbVramStrata) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | open-source-self-host-or-review | catalog-only |
| T008 | [Unsloth](https://github.com/unslothai/unsloth) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | open-source-self-host-or-review | catalog-only |
| T009 | [Qwen3.8-Flash-Next-GSQ-RCO-Coder](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-Coder-GGUF) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | verify-before-enable | catalog-only |
| T010 | [Ornith-1.5-35B-A3B](https://huggingface.co/ornith-ai/Ornith-1.5-35B-A3B) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | verify-before-enable | catalog-only |
| T011 | [LFM3-VL-2B](https://huggingface.co/LiquidAI/LFM3-VL-2B) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | verify-before-enable | catalog-only |
| T012 | [d1-2B](https://huggingface.co/LiquidAI/d1-2B) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | verify-before-enable | catalog-only |
| T013 | [Needle3](https://cactuscompute.com/needle) | inference | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | agent-runner | verify-before-enable | catalog-only |
| T014 | [OpenHuman](https://github.com/tinyhumansai/openhuman) | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | agent-runner | open-source-self-host-or-review | catalog-only |
| T015 | [Skales](https://github.com/skalesapp/skales) | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | agent-runner | open-source-self-host-or-review | catalog-only |
| T016 | [Prefect](https://github.com/PrefectHQ/prefect) | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | agent-runner | open-source-self-host-or-review | catalog-only |
| T017 | [mobile-mcp](https://github.com/mobile-next/mobile-mcp) | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | agent-runner | open-source-self-host-or-review | catalog-only |
| T018 | [obscura](https://github.com/h4ckf0r0day/obscura) | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | agent-runner | open-source-self-host-or-review | catalog-only |
| T019 | [Ponytail](https://github.com/DietrichGebert/ponytail) | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | agent-runner | open-source-self-host-or-review | catalog-only |
| T020 | [PhotoCraft](https://github.com/storytold/photocraft) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T021 | [LightCraft](https://github.com/storytold/lightcraft) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T022 | [VectorCraft](https://github.com/storytold/vectorcraft) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T023 | [FigCraft](https://github.com/storytold/figcraft) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T024 | [Qwen-Image-2.1](https://huggingface.co/Qwen/Qwen-Image-2.1) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T025 | [sozai-search-mcp](https://github.com/kanaworksai-hue/sozai-search-mcp) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T026 | [see-through](https://github.com/shitagaki-lab/see-through) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T027 | [Qwen3.5-4B-3D-Coder](https://huggingface.co/ccore/Qwen3.5-4B-3D-Coder) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T028 | [GridCraft](https://github.com/storytold/gridcraft) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T029 | [Bento](https://github.com/nyblnet/bento) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T030 | [marketing-os](https://github.com/Yuzzyuk/marketing-os) | design | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T031 | VaizStudio | video | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T032 | [FilmCraft](https://github.com/storytold/filmcraft) | video | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T033 | [Anicraft](https://github.com/storytold/anicraft) | video | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T034 | OBS | video | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T035 | [ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill) | video | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T036 | Irodori-TTS-v4 | voice | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T037 | [YuE2-Studio](https://github.com/timoncool/YuE2-Studio) | voice | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T038 | [JIZURA](https://github.com/852wa/JIZURA) | voice | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T039 | Haas-ja | voice | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T040 | [Plamo-3-Translate](https://huggingface.co/collections/pfnet/plamo-3-translate) | voice | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T041 | [PierrotKnowledge2](https://github.com/yuimaruofbook/PierrotKnowledge2) | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T042 | [Helix Notes](https://helixnotes.com/) | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | verify-before-enable | catalog-only |
| T043 | LLM Wiki | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | verify-before-enable | catalog-only |
| T044 | [book-to-skill](https://github.com/virgiliojr94/book-to-skill) | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T045 | [pdf-inspector](https://github.com/firecrawl/pdf-inspector) | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T046 | [last30days-skill](https://github.com/mvanhorn/last30days-skill) | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T047 | [FreshRSS](https://github.com/FreshRSS/FreshRSS) | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T048 | [kensaku](https://github.com/yjid/kensaku) | knowledge | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T049 | Bitwarden | security | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | verify-before-enable | catalog-only |
| T050 | [OpenShell](https://github.com/NVIDIA/OpenShell) | security | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T051 | [security-audit-skill](https://github.com/cloudflare/security-audit-skill) | security | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T052 | [SkillSpector](https://github.com/NVIDIA/skillspector) | security | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | catalog-only |
| T053 | [OSV-Scanner](https://github.com/google/osv-scanner) | security | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | open-source-self-host-or-review | staged-in-draft-pr |
| T054 | [instabox.sh](https://instabox.sh/) | security | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | infocollect | verify-before-enable | catalog-only |
| T055 | [Vite+](https://viteplus.dev/) | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | verify-before-enable | catalog-only |
| T056 | [ElectroBun](https://github.com/blackboardsh/electrobun) | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_active | VAIZ | open-source-self-host-or-review | catalog-only |
| T057 | HermesAgent | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_stopped | none | verify-before-enable | catalog-only |
| T058 | Muse | assistant | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_not_used | none | verify-before-enable | catalog-only |
| T059 | GrokBot | assistant | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_not_used | none | verify-before-enable | catalog-only |
| T060 | Dots | assistant | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_not_used | none | verify-before-enable | catalog-only |
| T061 | Rust slide generator | file | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_self_built | none | verify-before-enable | catalog-only |
| T062 | Rust office tools | file | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_self_built | none | verify-before-enable | catalog-only |
| T063 | Rust image converter | file | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_self_built | none | verify-before-enable | catalog-only |
| T064 | Rust compact OBS | file | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_self_built | none | verify-before-enable | catalog-only |
| T065 | oh-my-opencode | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T066 | OmniRoute | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T067 | SkillCollection | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T068 | SuperMemory | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T069 | DESIGN.md | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T070 | RTK | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T071 | Caveman | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T072 | headroom | coding | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T073 | OpenClaude | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T074 | pi + ohmypi | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T075 | MistralCode | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T076 | Codebuff | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T077 | NemoCode | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T078 | 9Router | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T079 | Gemini CLI | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T080 | Bun | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T081 | Tauri | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T082 | uv | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T083 | Aube | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T084 | AionUI | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T085 | ClawCode | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_not_used | none | verify-before-enable | catalog-only |
| T086 | FreeClaudeCode | coding | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_not_used | none | verify-before-enable | catalog-only |
| T087 | Ollama | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T088 | LM Studio | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T089 | Lemonade | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T090 | [UnslothStudio](https://github.com/unslothai/unsloth) | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T091 | llama.cpp | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T092 | Gemma 4 4B | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T093 | LFM2.5-8B-A1B | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T094 | MiniCPM5-1B | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T095 | Qwen3.6-27B | inference | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_removed | none | verify-before-enable | catalog-only |
| T096 | Crawl4AI | browser | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T097 | Chrome | browser | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T098 | LightPanda | browser | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T099 | OpenCLI-rs | browser | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T100 | Telegraf | browser | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T101 | ShareX | browser | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T102 | [Openfang](https://github.com/RightNow-AI/openfang) | assistant | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_stopped | none | verify-before-enable | catalog-only |
| T103 | ml-intern | assistant | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_stopped | none | verify-before-enable | catalog-only |
| T104 | ASI-Evolve | assistant | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_stopped | none | verify-before-enable | catalog-only |
| T105 | PersonalAIInstructor | assistant | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_stopped | none | verify-before-enable | catalog-only |
| T106 | Photo Agents | assistant | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_stopped | none | verify-before-enable | catalog-only |
| T107 | VLAA-GUI | assistant | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T108 | Scales | assistant | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T109 | [RAG-Anything](https://github.com/HKUDS/RAG-Anything) | knowledge | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | open-source-self-host-or-review | catalog-only |
| T110 | Obsidian | knowledge | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T111 | PPT-design-Prompt | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T112 | OpenCodeSign | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T113 | PPT-master | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T114 | OpenSlide | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T115 | oh-my-design | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T116 | Presenton | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T117 | Hallmark | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T118 | stop-slop | presentation | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | presentationgen | verify-before-enable | catalog-only |
| T119 | Clearwing | security | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T120 | auto-Identity-remove | security | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T121 | Hackingtool v2.0 | security | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T122 | PaddleOCR | security | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | infocollect | verify-before-enable | catalog-only |
| T123 | Irodori-TTS-lite | voice | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | VAIZ | verify-before-enable | catalog-only |
| T124 | Neko | workspace | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T125 | Bizend | workspace | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T126 | Paperclip | workspace | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T127 | Multica | workspace | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T128 | Archon | workspace | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T129 | Self-built kanban | workspace | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) · reported_historical | none | verify-before-enable | catalog-only |
| T130 | awesome-claude-code-toolkit | security | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_removed | none | verify-before-enable | catalog-only |
| T131 | everything-claude-code | security | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_removed | none | verify-before-enable | catalog-only |
| T132 | gstack | security | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_removed | none | verify-before-enable | catalog-only |
| T133 | Understand Anything | security | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_removed | none | verify-before-enable | catalog-only |
| T134 | Superpowers | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T135 | Plan & Implement | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T136 | Semantic Commit | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T137 | PR Review Checklist | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T138 | Documentation Writer | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T139 | Context7 | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T140 | Playwright | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T141 | Filesystem MCP | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T142 | GitHub MCP | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T143 | Sequential Thinking MCP | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_historical | agent-runner | verify-before-enable | catalog-only |
| T144 | Claude-Mem | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_discussed | agent-runner | verify-before-enable | catalog-only |
| T145 | Ralph Loop | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_discussed | agent-runner | verify-before-enable | catalog-only |
| T146 | [Firecrawl](https://github.com/firecrawl/firecrawl) | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_discussed | agent-runner | verify-before-enable | catalog-only |
| T147 | Figma MCP | coding | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) · reported_discussed | agent-runner | verify-before-enable | catalog-only |
| T148 | actionlint | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T149 | zizmor | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T150 | Betterleaks | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T151 | Semgrep | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T152 | Trivy | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T153 | Renovate | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T154 | Sigstore Cosign | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T155 | SLSA provenance | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T156 | Dependency Review Action | security | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T157 | ast-grep | coding | 独自提案／使用不明 | agent-runner | verify-before-enable | catalog-only |
| T158 | tree-sitter | coding | 独自提案／使用不明 | agent-runner | verify-before-enable | catalog-only |
| T159 | OpenTelemetry | coding | 独自提案／使用不明 | agent-runner | verify-before-enable | catalog-only |
| T160 | GitHub Actions reusable workflow audit | coding | 独自提案／使用不明 | agent-runner | verify-before-enable | catalog-only |
| T161 | Lean 4 | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T162 | mathlib | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T163 | SymPy | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T164 | Hypothesis | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T165 | Ruff | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T166 | Z3 | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T167 | JAX | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-before-enable | catalog-only |
| T168 | DuckDB | data | 独自提案／使用不明 | QAIZ | verify-before-enable | catalog-only |
| T169 | Polars | data | 独自提案／使用不明 | QAIZ | verify-before-enable | catalog-only |
| T170 | Apache Arrow | data | 独自提案／使用不明 | QAIZ | verify-before-enable | catalog-only |
| T171 | Parquet | data | 独自提案／使用不明 | QAIZ | verify-before-enable | catalog-only |
| T172 | Great Expectations | data | 独自提案／使用不明 | QAIZ | verify-before-enable | catalog-only |
| T173 | Evidently AI | data | 独自提案／使用不明 | QAIZ | verify-before-enable | catalog-only |
| T174 | [Readability.js](https://github.com/mozilla/readability) | browser | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T175 | Trafilatura | browser | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T176 | SearXNG | browser | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T177 | [RSSHub](https://github.com/DIYgod/RSSHub) | browser | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T178 | Playwright MCP | browser | 独自提案／使用不明 | infocollect | verify-before-enable | catalog-only |
| T179 | [FFmpeg](https://github.com/FFmpeg/FFmpeg) | video | 独自提案／使用不明 | VAIZ | open-source-self-host-or-review | existing-capability-observed |
| T180 | [ffprobe](https://ffmpeg.org/ffprobe.html) | video | 独自提案／使用不明 | VAIZ | open-source-self-host-or-review | existing-capability-observed |
| T181 | Remotion | video | 独自提案／使用不明 | VAIZ | verify-before-enable | catalog-only |
| T182 | [Whisper.cpp](https://github.com/ggml-org/whisper.cpp) | video | 独自提案／使用不明 | VAIZ | verify-before-enable | catalog-only |
| T183 | faster-whisper | video | 独自提案／使用不明 | VAIZ | verify-before-enable | catalog-only |
| T184 | Piper TTS | video | 独自提案／使用不明 | VAIZ | verify-before-enable | catalog-only |
| T185 | [Blender](https://github.com/blender/blender) | video | 独自提案／使用不明 | VAIZ | verify-before-enable | catalog-only |
| T186 | [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | presentation | 独自提案／使用不明 | presentationgen | verify-before-enable | catalog-only |
| T187 | Marp | presentation | 独自提案／使用不明 | presentationgen | verify-before-enable | catalog-only |
| T188 | Slidev | presentation | 独自提案／使用不明 | presentationgen | verify-before-enable | catalog-only |
| T189 | [craft-anything](https://github.com/storytold/craft-anything) | coding | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | VAIZ | verify-license-and-local-runtime | catalog-only |
| T190 | [OGAM](https://github.com/off-grid-ai/OGAM) | automation | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | infocollect | verify-license-and-local-runtime | catalog-only |
| T191 | [NectarLink](https://github.com/thtbee/nectarlink) | automation | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | infocollect | verify-license-and-local-runtime | catalog-only |
| T192 | [Gander](https://github.com/mokshablr/gander) | automation | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | infocollect | verify-license-and-local-runtime | catalog-only |
| T193 | [OpenLogi](https://github.com/AprilNEA/OpenLogi) | automation | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | infocollect | verify-license-and-local-runtime | catalog-only |
| T194 | [Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | game | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | VAIZ | verify-license-and-local-runtime | catalog-only |
| T195 | Rmux | orchestration | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | infocollect | verify-license-and-local-runtime | catalog-only |
| T196 | [Irodori-TTS-v4-Small](https://huggingface.co/Aratako/Irodori-TTS-v4-Small) | voice | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | VAIZ | verify-license-and-local-runtime | catalog-only |
| T197 | [OpenShell NVIDIA](https://github.com/NVIDIA/OpenShell) | security | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | infocollect | verify-license-and-local-runtime | catalog-only |
| T198 | [Haas-ja-v1.0](https://huggingface.co/third-intelligence/Haas-ja-v1.0) | voice | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) · reported_mentioned | VAIZ | verify-license-and-local-runtime | catalog-only |
| T199 | [Open WebUI](https://github.com/open-webui/open-webui) | assistant | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T200 | [LibreChat](https://github.com/danny-avila/LibreChat) | assistant | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T201 | [LocalAI](https://github.com/mudler/LocalAI) | inference | 独自提案／使用不明 | none | verify-license-and-local-runtime | catalog-only |
| T202 | [Jan](https://github.com/janhq/jan) | inference | 独自提案／使用不明 | none | verify-license-and-local-runtime | catalog-only |
| T203 | [vLLM](https://github.com/vllm-project/vllm) | inference | 独自提案／使用不明 | none | verify-license-and-local-runtime | catalog-only |
| T204 | [SGLang](https://github.com/sgl-project/sglang) | inference | 独自提案／使用不明 | none | verify-license-and-local-runtime | catalog-only |
| T205 | [Continue](https://github.com/continuedev/continue) | coding | 独自提案／使用不明 | agent-runner | verify-license-and-local-runtime | catalog-only |
| T206 | [Cline](https://github.com/cline/cline) | coding | 独自提案／使用不明 | agent-runner | verify-license-and-local-runtime | catalog-only |
| T207 | [Aider](https://github.com/Aider-AI/aider) | coding | 独自提案／使用不明 | agent-runner | verify-license-and-local-runtime | catalog-only |
| T208 | [OpenHands](https://github.com/All-Hands-AI/OpenHands) | coding | 独自提案／使用不明 | agent-runner | verify-license-and-local-runtime | catalog-only |
| T209 | [SWE-Agent](https://github.com/SWE-agent/SWE-agent) | coding | 独自提案／使用不明 | agent-runner | verify-license-and-local-runtime | catalog-only |
| T210 | [PydanticAI](https://github.com/pydantic/pydantic-ai) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T211 | [LangGraph](https://github.com/langchain-ai/langgraph) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T212 | [LlamaIndex](https://github.com/run-llama/llama_index) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T213 | [Haystack](https://github.com/deepset-ai/haystack) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T214 | [DSPy](https://github.com/stanfordnlp/dspy) | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-license-and-local-runtime | catalog-only |
| T215 | [smolagents](https://github.com/huggingface/smolagents) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T216 | [AutoGen](https://github.com/microsoft/autogen) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T217 | [CrewAI](https://github.com/crewAIInc/crewAI) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T218 | [Dify](https://github.com/langgenius/dify) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T219 | [Flowise](https://github.com/FlowiseAI/Flowise) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T220 | [n8n](https://github.com/n8n-io/n8n) | orchestration | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T221 | [Docling](https://github.com/docling-project/docling) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T222 | [Marker](https://github.com/datalab-to/marker) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T223 | [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T224 | [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T225 | [Apache Tika](https://github.com/apache/tika) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T226 | [Surya OCR](https://github.com/datalab-to/surya) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T227 | [Qdrant](https://github.com/qdrant/qdrant) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T228 | [Chroma](https://github.com/chroma-core/chroma) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T229 | [LanceDB](https://github.com/lancedb/lancedb) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T230 | [sqlite-vec](https://github.com/asg017/sqlite-vec) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T231 | [pgvector](https://github.com/pgvector/pgvector) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T232 | [Meilisearch](https://github.com/meilisearch/meilisearch) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T233 | [Typesense](https://github.com/typesense/typesense) | knowledge | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T234 | [Browser Use](https://github.com/browser-use/browser-use) | browser | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T235 | [PostgreSQL](https://github.com/postgres/postgres) | data | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T236 | [Pandera](https://github.com/unionai-oss/pandera) | data | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T237 | [Datasette](https://github.com/simonw/datasette) | data | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T238 | [Ragas](https://github.com/explodinggradients/ragas) | research | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T239 | [DeepEval](https://github.com/confident-ai/deepeval) | research | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T240 | [Langfuse](https://github.com/langfuse/langfuse) | observability | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T241 | [Arize Phoenix](https://github.com/Arize-ai/phoenix) | observability | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T242 | [MLflow](https://github.com/mlflow/mlflow) | research | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T243 | [Prometheus](https://github.com/prometheus/prometheus) | observability | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T244 | [Grafana OSS](https://github.com/grafana/grafana) | observability | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T245 | [Loki](https://github.com/grafana/loki) | observability | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T246 | [Jaeger](https://github.com/jaegertracing/jaeger) | observability | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T247 | [Syft](https://github.com/anchore/syft) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T248 | [Grype](https://github.com/anchore/grype) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T249 | [OpenSSF Scorecard](https://github.com/ossf/scorecard) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T250 | [TruffleHog](https://github.com/trufflesecurity/trufflehog) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T251 | [Checkov](https://github.com/bridgecrewio/checkov) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T252 | [Dependabot](https://github.com/dependabot/dependabot-core) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T253 | [Penpot](https://github.com/penpot/penpot) | design | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T254 | [ImageMagick](https://github.com/ImageMagick/ImageMagick) | design | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T255 | [Sharp](https://github.com/lovell/sharp) | design | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T256 | [Satori](https://github.com/vercel/satori) | design | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T257 | [Godot](https://github.com/godotengine/godot) | game | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T258 | [Kdenlive](https://github.com/KDE/kdenlive) | video | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T259 | [OBS Studio](https://github.com/obsproject/obs-studio) | video | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T260 | [Audacity](https://github.com/audacity/audacity) | voice | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T261 | [Krita](https://github.com/KDE/krita) | design | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T262 | [Inkscape](https://gitlab.com/inkscape/inkscape) | design | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T263 | [MeloTTS](https://github.com/myshell-ai/MeloTTS) | voice | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T264 | [OpenVoice](https://github.com/myshell-ai/OpenVoice) | voice | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T265 | [SOPS](https://github.com/getsops/sops) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T266 | [age](https://github.com/FiloSottile/age) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T267 | [KeePassXC](https://github.com/keepassxreboot/keepassxc) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T268 | [Authentik](https://github.com/goauthentik/authentik) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T269 | [Headscale](https://github.com/juanfont/headscale) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T270 | [WireGuard](https://www.wireguard.com/) | security | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T271 | [restic](https://github.com/restic/restic) | file | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T272 | [rclone](https://github.com/rclone/rclone) | file | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T273 | [Syncthing](https://github.com/syncthing/syncthing) | file | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T274 | [Uptime Kuma](https://github.com/louislam/uptime-kuma) | observability | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T275 | [Caddy](https://github.com/caddyserver/caddy) | deployment | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |
| T276 | [PyMC](https://github.com/pymc-devs/pymc) | research | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T277 | [ArviZ](https://github.com/arviz-devs/arviz) | research | 独自提案／使用不明 | QAIZ | verify-license-and-local-runtime | catalog-only |
| T278 | [NetworkX](https://github.com/networkx/networkx) | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-license-and-local-runtime | catalog-only |
| T279 | [SageMath](https://github.com/sagemath/sage) | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-license-and-local-runtime | catalog-only |
| T280 | [OpenFOAM](https://github.com/OpenFOAM/OpenFOAM-dev) | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-license-and-local-runtime | catalog-only |
| T281 | [LilyPond](https://gitlab.com/lilypond/lilypond) | voice | 独自提案／使用不明 | VAIZ | verify-license-and-local-runtime | catalog-only |
| T282 | [Gnuplot](https://sourceforge.net/projects/gnuplot/) | research | 独自提案／使用不明 | Mathematical-Physics-Lab- | verify-license-and-local-runtime | catalog-only |
| T283 | Elephant-Goldfish Model | coding | 独自提案／使用不明 | agent-runner | verify-license-and-local-runtime | catalog-only |
| T284 | [reverse-engineer-marketing](https://github.com/dansugc/reverse-engineer-marketing) | research | 独自提案／使用不明 | infocollect | verify-license-and-local-runtime | catalog-only |

## インストール実行は各専門リポジトリへ

他人のプラグインやSkillを、この表から一括インストールしてはいけません。まず個別リポジトリに閉じたPRで依存関係・ライセンス・README・CI・実行可能なテストをそろえます。これには人間のレビューが必要です。

### 即時利用できる無料コマンドとレビュー用PR
- VAIZ: `bun test` と `bun run video:validate`（メディア出力検査はPR段階）
- Mathematical-Physics-Lab-: `python -m pytest -q` と `python -m research.ledger_audit_cli PATH_TO_LEDGER`（台帳検査はPR段階）
- InfoCollect: `npm run fleet:check` と `npm run fleet:plan`。外部APIキーは使わない。
- OSV: 公開リポジトリPRでGoogle公式OSSが依存脆弱性を照合するPRを追加（作業ブランチの機能）。

### 守る境界
一度に全ツールを導入しない。GPUモデルはPC側の専門ワーカーの任意設定、Dockerは隔離が必要なプロセスだけ、秘密情報はリポジトリに保存しない。`agent-runner`は軽量な司令塔のままです。
