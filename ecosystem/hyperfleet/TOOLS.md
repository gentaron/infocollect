# Hyperfleet tool inventory

2026-11-16 調査。**この表は導入候補台帳であり、ツールがインストール済みという意味ではありません。**

司令塔の `gentaron/agent-runner` は `/ask`・`/run`・OpenCodeによる割り振りとPR返信のみに保つ。知識基盤 `infocollect` に置くこの台帳は研究情報であり、実行機能や自動インストーラーではない。

## 一次資料
- N12: [2026-11-12 環境構成の再整理](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac)
- M30: [2026-05-30 OSS使用環境の棚卸し](https://note.com/humble_bobcat51/n/na35caa6136b7)
- J22: [2026-07-22 OpenCodeの構成](https://note.com/humble_bobcat51/n/nc3960d322fdb)
- M23: [2026-03-23 Claude Code拡張の整理](https://note.com/humble_bobcat51/n/ndf5aba8a5022)

## 状態の区別
- **reported_active**: 記事で使用と書かれている。実機での独立検証ではない。
- **reported_historical**: 古い記事で使用と書かれているが、現在も使うとは限らない。
- **reported_stopped / removed / not_used**: 本人がその時点で停止・削除・未使用と記した。
- **not_confirmed**: こちらから追加した候補。本人が使っていないという主張ではない。
- **optional / candidate**: レビュー候補。**自動インストールしない**。

## 分野別ツール一覧

| # | ツール名 | 分野 | ユイマル記事上の状態 | 出典 | 担当リポジトリ | 導入判断 |
|---|---|---|---|---|---|---|
| T001 | OpenCode | coding | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | already |
| T002 | Claude Code | coding | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | already |
| T003 | Codex | coding | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | already |
| T004 | OpenRouter | coding | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | already |
| T005 | NVIDIA AI API | coding | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | already |
| T006 | Strata | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T007 | 4gbVramStrata | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T008 | Unsloth | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T009 | Qwen3.8-Flash-Next-GSQ-RCO-Coder | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T010 | Ornith-1.5-35B-A3B | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T011 | LFM3-VL-2B | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T012 | d1-2B | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T013 | Needle3 | inference | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | optional |
| T014 | OpenHuman | orchestration | reported_mentioned | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | defer |
| T015 | Skales | orchestration | reported_mentioned | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | defer |
| T016 | Prefect | orchestration | reported_mentioned | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | defer |
| T017 | mobile-mcp | orchestration | reported_mentioned | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | defer |
| T018 | obscura | orchestration | reported_mentioned | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | defer |
| T019 | Ponytail | orchestration | reported_mentioned | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | agent-runner | defer |
| T020 | PhotoCraft | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T021 | LightCraft | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T022 | VectorCraft | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T023 | FigCraft | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T024 | Qwen-Image-2.1 | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T025 | sozai-search-mcp | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T026 | see-through | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T027 | Qwen3.5-4B-3D-Coder | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T028 | GridCraft | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T029 | Bento | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T030 | marketing-os | design | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T031 | VaizStudio | video | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T032 | FilmCraft | video | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T033 | Anicraft | video | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T034 | OBS | video | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T035 | ffmpeg-skill | video | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T036 | Irodori-TTS-v4 | voice | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T037 | YuE2-Studio | voice | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T038 | JIZURA | voice | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T039 | Haas-ja | voice | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T040 | Plamo-3-Translate | voice | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T041 | PierrotKnowledge2 | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T042 | Helix Notes | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T043 | LLM Wiki | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T044 | book-to-skill | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T045 | pdf-inspector | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T046 | last30days-skill | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T047 | FreshRSS | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T048 | kensaku | knowledge | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T049 | Bitwarden | security | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T050 | OpenShell | security | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T051 | security-audit-skill | security | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T052 | SkillSpector | security | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T053 | OSV-Scanner | security | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T054 | instabox.sh | security | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | infocollect | optional |
| T055 | Vite+ | coding | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T056 | ElectroBun | coding | reported_active | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | VAIZ | optional |
| T057 | HermesAgent | orchestration | reported_stopped | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | excluded |
| T058 | Muse | assistant | reported_not_used | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | excluded |
| T059 | GrokBot | assistant | reported_not_used | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | excluded |
| T060 | Dots | assistant | reported_not_used | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | excluded |
| T061 | Rust slide generator | file | reported_self_built | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | defer |
| T062 | Rust office tools | file | reported_self_built | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | defer |
| T063 | Rust image converter | file | reported_self_built | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | defer |
| T064 | Rust compact OBS | file | reported_self_built | [N12](https://note.com/humble_bobcat51/n/nb9d0f1d0e8ac) | none | defer |
| T065 | oh-my-opencode | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T066 | OmniRoute | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T067 | SkillCollection | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T068 | SuperMemory | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T069 | DESIGN.md | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T070 | RTK | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T071 | Caveman | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T072 | headroom | coding | reported_historical | [J22](https://note.com/humble_bobcat51/n/nc3960d322fdb) | agent-runner | optional |
| T073 | OpenClaude | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T074 | pi + ohmypi | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T075 | MistralCode | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T076 | Codebuff | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T077 | NemoCode | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T078 | 9Router | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T079 | Gemini CLI | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T080 | Bun | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T081 | Tauri | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T082 | uv | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T083 | Aube | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T084 | AionUI | coding | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | agent-runner | optional |
| T085 | ClawCode | coding | reported_not_used | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T086 | FreeClaudeCode | coding | reported_not_used | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T087 | Ollama | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T088 | LM Studio | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T089 | Lemonade | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T090 | UnslothStudio | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T091 | llama.cpp | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T092 | Gemma 4 4B | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T093 | LFM2.5-8B-A1B | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T094 | MiniCPM5-1B | inference | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | Mathematical-Physics-Lab- | optional |
| T095 | Qwen3.6-27B | inference | reported_removed | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T096 | Crawl4AI | browser | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T097 | Chrome | browser | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T098 | LightPanda | browser | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T099 | OpenCLI-rs | browser | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T100 | Telegraf | browser | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T101 | ShareX | browser | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T102 | Openfang | assistant | reported_stopped | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T103 | ml-intern | assistant | reported_stopped | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T104 | ASI-Evolve | assistant | reported_stopped | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T105 | PersonalAIInstructor | assistant | reported_stopped | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T106 | Photo Agents | assistant | reported_stopped | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | excluded |
| T107 | VLAA-GUI | assistant | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T108 | Scales | assistant | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T109 | RAG-Anything | knowledge | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T110 | Obsidian | knowledge | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T111 | PPT-design-Prompt | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T112 | OpenCodeSign | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T113 | PPT-master | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T114 | OpenSlide | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T115 | oh-my-design | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T116 | Presenton | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T117 | Hallmark | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T118 | stop-slop | presentation | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | presentationgen | optional |
| T119 | Clearwing | security | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T120 | auto-Identity-remove | security | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T121 | Hackingtool v2.0 | security | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T122 | PaddleOCR | security | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | infocollect | optional |
| T123 | Irodori-TTS-lite | voice | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | VAIZ | optional |
| T124 | Neko | workspace | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T125 | Bizend | workspace | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T126 | Paperclip | workspace | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T127 | Multica | workspace | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T128 | Archon | workspace | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T129 | Self-built kanban | workspace | reported_historical | [M30](https://note.com/humble_bobcat51/n/na35caa6136b7) | none | defer |
| T130 | awesome-claude-code-toolkit | security | reported_removed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | none | excluded |
| T131 | everything-claude-code | security | reported_removed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | none | excluded |
| T132 | gstack | security | reported_removed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | none | excluded |
| T133 | Understand Anything | security | reported_removed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | none | excluded |
| T134 | Superpowers | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T135 | Plan & Implement | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T136 | Semantic Commit | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T137 | PR Review Checklist | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T138 | Documentation Writer | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T139 | Context7 | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T140 | Playwright | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T141 | Filesystem MCP | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T142 | GitHub MCP | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T143 | Sequential Thinking MCP | coding | reported_historical | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | optional |
| T144 | Claude-Mem | coding | reported_discussed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | defer |
| T145 | Ralph Loop | coding | reported_discussed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | defer |
| T146 | Firecrawl | coding | reported_discussed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | defer |
| T147 | Figma MCP | coding | reported_discussed | [M23](https://note.com/humble_bobcat51/n/ndf5aba8a5022) | agent-runner | defer |
| T148 | actionlint | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T149 | zizmor | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T150 | Betterleaks | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T151 | Semgrep | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T152 | Trivy | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T153 | Renovate | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T154 | Sigstore Cosign | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T155 | SLSA provenance | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T156 | Dependency Review Action | security | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T157 | ast-grep | coding | not_confirmed | 当方の追加候補 | agent-runner | candidate |
| T158 | tree-sitter | coding | not_confirmed | 当方の追加候補 | agent-runner | candidate |
| T159 | OpenTelemetry | coding | not_confirmed | 当方の追加候補 | agent-runner | candidate |
| T160 | GitHub Actions reusable workflow audit | coding | not_confirmed | 当方の追加候補 | agent-runner | candidate |
| T161 | Lean 4 | research | not_confirmed | 当方の追加候補 | Mathematical-Physics-Lab- | candidate |
| T162 | mathlib | research | not_confirmed | 当方の追加候補 | Mathematical-Physics-Lab- | candidate |
| T163 | SymPy | research | not_confirmed | 当方の追加候補 | Mathematical-Physics-Lab- | candidate |
| T164 | Hypothesis | research | not_confirmed | 当方の追加候補 | Mathematical-Physics-Lab- | candidate |
| T165 | Ruff | research | not_confirmed | 当方の追加候補 | Mathematical-Physics-Lab- | candidate |
| T166 | Z3 | research | not_confirmed | 当方の追加候補 | Mathematical-Physics-Lab- | candidate |
| T167 | JAX | research | not_confirmed | 当方の追加候補 | Mathematical-Physics-Lab- | candidate |
| T168 | DuckDB | data | not_confirmed | 当方の追加候補 | QAIZ | candidate |
| T169 | Polars | data | not_confirmed | 当方の追加候補 | QAIZ | candidate |
| T170 | Apache Arrow | data | not_confirmed | 当方の追加候補 | QAIZ | candidate |
| T171 | Parquet | data | not_confirmed | 当方の追加候補 | QAIZ | candidate |
| T172 | Great Expectations | data | not_confirmed | 当方の追加候補 | QAIZ | candidate |
| T173 | Evidently AI | data | not_confirmed | 当方の追加候補 | QAIZ | candidate |
| T174 | Readability.js | browser | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T175 | Trafilatura | browser | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T176 | SearXNG | browser | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T177 | RSSHub | browser | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T178 | Playwright MCP | browser | not_confirmed | 当方の追加候補 | infocollect | candidate |
| T179 | FFmpeg | video | not_confirmed | 当方の追加候補 | VAIZ | candidate |
| T180 | ffprobe | video | not_confirmed | 当方の追加候補 | VAIZ | candidate |
| T181 | Remotion | video | not_confirmed | 当方の追加候補 | VAIZ | candidate |
| T182 | Whisper.cpp | video | not_confirmed | 当方の追加候補 | VAIZ | candidate |
| T183 | faster-whisper | video | not_confirmed | 当方の追加候補 | VAIZ | candidate |
| T184 | Piper TTS | video | not_confirmed | 当方の追加候補 | VAIZ | candidate |
| T185 | Blender | video | not_confirmed | 当方の追加候補 | VAIZ | candidate |
| T186 | PptxGenJS | presentation | not_confirmed | 当方の追加候補 | presentationgen | candidate |
| T187 | Marp | presentation | not_confirmed | 当方の追加候補 | presentationgen | candidate |
| T188 | Slidev | presentation | not_confirmed | 当方の追加候補 | presentationgen | candidate |

## 実装と運用の原則
1. 実装、依存関係、Secrets、GPUコスト、CIはそれぞれの専門リポジトリで管理。ハブに機能を寄せない。
2. 高額・GPU・私有クラウド・ログイン・有料API・商用ライセンスは**明示的な承認なしに起動しない**。
3. ツール名の存在と実機で動くこと、使用実績と研究記事での言及を分ける。
4. 外部skills/MCPを一括で読み込まず、出所確認、バージョン固定、読み取り権限から試す。
5. テスト成功、再現性、監査記録を実証するまでは世界最高峰などの品質保証を主張しない。
6. `node scripts/validate-hyperfleet-catalog.mjs` で重複・担当・出典を検査する。

## 導入する領域（能力の単位）
- InfoCollect: 来源付きKB、鮮度、重複、未検証の区別。RSS/研究/ブラウザは隔離。
- IDEAZ: 企画の重複除去、出典・テーマの独立性、文章生成とは別の品質ゲート。
- VAIZ: ブリーフ→素材→音声→動画→レビュー用納品。FFmpeg成果物の契約検査。
- QAIZ: Point-in-Time、予測検証、過適合監査、分野専門AIの研究日誌。
- Mathematical-Physics-Lab-: 厳密数学・仮説の反証・証明台帳。推論モデルの提案と数学検証を分離。
- Genesis Vault: 情報源と記事の一貫性、執筆・審査・公開責任。
- presentationgen: 編集可能ファイルの再現性、ページ描画チェック、生成物の人間レビュー。

## 注意
`reported_active`でも2026-11-12記事で列挙されただけのものが含まれます。複数の記事間で運用方針が変わったツールは、最も新しい根拠を優先しました。すべての外部ツールを一括導入したとは主張しません。
