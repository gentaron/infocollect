# 最先端マップ 調査メモ（2026年11月17日時点）

毎日の自動収集（`config/frontier.json` → PWAの「最先端マップ」）の**出発点**として、手で調べた分野別の現在地を残しておくメモ。
自動収集が「今日なにが動いたか」を拾うのに対して、こちらは「どこに誰がいて、何が芯か」の地図。

部門の分け方（3部門）:

| 部門 | 何を入れるか |
| --- | --- |
| **オープンソース（OSS）** | コミュニティ・大学・個人が出していて、コード・重み・データを誰でも使えるもの |
| **大手** | 巨大テック・国家級ラボの公式発表。中身はクローズド中心 |
| **どっちつかず** | 大手のオープンウェイト／OSS、研究所・スタートアップ、査読前論文、学術誌、専門メディア |

> 注意: 二次情報（まとめサイト・トラッカー）由来の数字・日付は食い違いが多い。☑ は一次情報（論文・公式発表）で確認できたもの、△ は二次情報のみで要確認。

---

## 1. 基盤モデル（LLM・マルチモーダル）

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | OpenAI・Google（Gemini）・Anthropic（Claude）のフロンティアモデル。10〜11月にも各社の新系列が出ている △（トラッカー間で名称・日付が不一致） |
| どっちつかず | 中国勢のオープンウェイト（DeepSeek・Qwen・Kimi など）。11月は Kimi K3 系のオープンウェイトが最も話題 △。Meta Llama 系、NVIDIA の公開モデル |
| OSS | llama.cpp / vLLM / Ollama などの推論基盤、Hugging Face Trending の派生モデル（自動収集で毎日追跡） |

芯: 「オープンウェイト＝OSS」ではない。重みは配るが学習データ・コードは出さない、ライセンスで商用制限、というパターンが大半なので本ツールでは**どっちつかず**扱いにしている。

## 2. エージェント・開発ハーネス

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | Claude Code・Codex・Gemini CLI・GitHub Copilot のエージェント機能 |
| どっちつかず | MCP（Model Context Protocol）のエコシステム、LangChain / LlamaIndex などの企業発OSS |
| OSS | GitHub の `topic:mcp` `topic:ai-agents` `topic:coding-agent` で伸びているリポジトリ（毎日自動） |

## 3. 解釈可能性・安全性・ステアリング（AI側の「ステアリング」）

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | Anthropic の回路・特徴量研究、Google DeepMind の Gemma Scope 系 |
| どっちつかず | Goodfire などの解釈可能性スタートアップ、arXiv の SAE / activation steering 論文 |
| OSS | SAELens・TransformerLens・NNsight・Neuronpedia（研究の標準ツール） |

芯: 2026年は「SAEの特徴量で狙って挙動を変えられる」という主張の**脆さ**を検証する論文が増えている。Anthropic の SAE ステアリング結果をオープンなSAE（Llama 3.1）で追試し、層・強さ・文脈に敏感で壊れやすいと報告したもの（arXiv:2601.03047）☑、英語偏りの SAE は多言語制御で不安定とするもの（arXiv:2605.23036）☑。

## 4. ワールドモデル・フィジカルAI・ロボティクス

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | Google DeepMind Genie 3（クローズド／限定公開）、World Labs Marble（サブスク） |
| どっちつかず | NVIDIA Cosmos（オープンウェイトだが独自ライセンス）。Cosmos 3 系は 2026年中に段階的に公開、11月5日に4つの追加チェックポイント △（公開日が資料ごとに食い違う）。Meta V-JEPA 2（オープン） |
| OSS | LeRobot など Hugging Face 周辺、GitHub `topic:world-model` `topic:embodied-ai` |

芯: 「動画がきれいに出る」ことと「方策学習に使える精度のシミュレータである」ことは別。NVIDIA 自身も方策学習・評価への忠実度は今後の測定課題としている。

## 5. 量子コンピュータ・量子情報

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | IBM（Quantum System Two、QEC符号の性能検証手法）、Google Quantum AI、Microsoft（Atom Computing と論理量子ビット機 "Magne" を共同開発 △） |
| どっちつかず | Quantinuum（Nexus でQECとアプリを分離、2029年に数百論理量子ビット目標）、Infleqtion（中性原子で論理量子ビット30個を物理80個で実証 △）、arXiv quant-ph |
| OSS | Qiskit・Cirq・Stim / PyMatching などQEC系ツール、GitHub `topic:quantum-error-correction` |

芯: 2026年の主戦場は物理量子ビット数ではなく**論理量子ビットと誤り率の指数的抑制**。暗号を破れる規模（数百万物理量子ビット級）はまだ遠い。

## 6. 数理物理・理論物理・AI×数学

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | Google DeepMind（Erdős 問題 353件中9件を自律解決とする論文 △ arXiv）、OpenAI（Lean 4 証明つきの未解決問題成果 △ 一次未確認） |
| どっちつかず | Axiom（AxiomProver が Fel の予想を Lean で形式証明 △）、北京大学チーム Archon（可換代数の未解決問題を Lean 4 で検証 △）、arXiv math-ph / hep-th、Quanta Magazine |
| OSS | Lean 4 / Mathlib、Terence Tao のブログ（AI×数学の実験記録） |

芯: Lean で検証済み＝「形式化した命題が正しい」まで。形式化した命題が本当に元の予想と同じかは人が読むしかない。ここを分けて読むのが一番大事。

## 7. バイオ・合成生物学・AI創薬

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | Isomorphic Labs / AlphaFold 3、Google DeepMind の生物系モデル |
| どっちつかず | Arc Institute × NVIDIA **Evo 2**（全生命ドメインのゲノム基盤モデル、Nature 2026年3月 ☑、9.3兆塩基で学習、重み・コード・OpenGenome2データ公開）、bioRxiv、Nature Biotechnology |
| OSS | ESM 系の公開モデル、GitHub `topic:protein-design` `topic:bioinformatics` |

芯: Evo 2 は機能するバクテリオファージのゲノム設計まで行っているが、変異病原性の「精度90%超」などの数字は二次情報 △。ヒトか動物か、試験管か、追試はあるかで証拠の強さを分けて読む。

## 8. ニューロサイエンス・BCI・ニューロモジュレーション（ニューロステアリング）

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | Neuralink（N1、1024電極。参加者数は資料で食い違い △）、Medtronic の適応型DBS（脳信号に応じて刺激を自動調整、2025年に FDA・CE 承認 △） |
| どっちつかず | Synchron（血管内留置型）、Merge Labs（超音波による非侵襲BCI、OpenAI が出資 △）、USC の歩行用双方向BCI（Brain Stimulation 2026年4月 △）、bioRxiv neuroscience、The Transmitter |
| OSS | MNE-Python などの EEG / 神経データ解析、GitHub `topic:brain-computer-interface` |

芯: 「ニューロステアリング」の本命は**閉ループ**（読む→判断→刺激する、を自動で回す）。BCI への投資は2026年に10億ドル超 △ だが、臨床データはまだ少人数のものが多い。

## 9. 半導体・AIチップ・新素材

| 部門 | いま見るべきもの |
| --- | --- |
| 大手 | NVIDIA・TSMC・Google TPU・各社カスタムASIC、HBM と先端パッケージング |
| どっちつかず | SemiAnalysis、IEEE Spectrum、arXiv cond-mat.mtrl-sci（AI材料探索） |
| OSS | RISC-V・オープンなEDA / FPGA ツールチェーン |

---

## 自動収集で毎日拾っている場所

`config/frontier.json` に分野ごとに宣言してある（編集するだけで増減できる）。

- 論文: arXiv（cs.CL / cs.LG / cs.RO / quant-ph / math-ph / hep-th / q-bio.BM / q-bio.NC / cond-mat.mtrl-sci）、bioRxiv（合成生物学 / バイオインフォ / 神経科学）
- 専門メディア: Quanta Magazine、The Quantum Insider、Phys.org、The Transmitter、IEEE Spectrum、GEN、STAT、SemiAnalysis、Nature 各誌
- 各社: OpenAI、Google DeepMind、Google Research、Meta AI、Microsoft Research、IBM Research、NVIDIA、GitHub
- 個人・コミュニティ: Simon Willison、Terence Tao、Alignment Forum、Hacker News（分野ごとの検索語）
- OSS: GitHub 検索（分野ごとのトピック）＋ Hugging Face Trending

## 調べきれなかったこと

- 先行して書いている note の書き手の記事一覧は、この作業環境から note.com に接続できず直接確認できなかった。`memory/people/humble-bobcat51.md` に最近のタイトルを貼れば、ブログ生成が題材の重複を避けて先回りできる。
- 上の △ の項目は一次情報（論文・公式発表・FDA / ClinicalTrials.gov）で確認してから記事に使うこと。

## 参照した資料（2026年11月の調査）

- World model: [Wikipedia](https://en.wikipedia.org/wiki/World_model_(artificial_intelligence)) / [Cosmos 3 checkpoints (letsdatascience)](https://letsdatascience.com/news/nvidia-releases-four-open-cosmos-3-checkpoints-for-world-sim-36487992) / [runtimewire](https://runtimewire.com/article/nvidia-cosmos-3-open-checkpoints-interactive-world-simulation) / [introl](https://introl.com/blog/world-models-race-agi-2026)
- 量子: [Quantinuum blog](https://www.quantinuum.com/blog/from-memory-to-logic) / [Interesting Engineering](https://interestingengineering.com/innovation/us-firm-entangled-logical-qubits-quantum-computer) / [Live Science](https://livescience.com/technology/quantum/ibm-quantum-processor-achieves-highest-fidelity-calculations-for-the-longest-period-of-time-on-record) / [HPCwire](https://www.hpcwire.com/off-the-wire/microsofts-application-of-error-correction-to-trapped-ion-qubits-published-in-nature/) / [Quantum Zeitgeist](https://quantumzeitgeist.com/quantum-zeitgeist-weekly-digest-nov-9/)
- BCI: [glia.ca](https://glia.ca/2026/bci) / [remio (PitchBook)](https://www.remio.ai/post/pitchbook-bci-funding-tops-1-billion-but-clinical-proof-still-lags) / [newmarketpitch](https://newmarketpitch.com/blogs/news/brain-computer-interface-funding-deals) / [liveinthefuture](https://liveinthefuture.org/stories/bci-electrode-count-vs-safety-data)
- バイオ: [Arc Institute Evo 2](https://arcinstitute.org/news/evo2) / [PubMed](https://pubmed.ncbi.nlm.nih.gov/41781614/) / [GEN](https://www.genengnews.com/topics/genome-editing/arc-institutes-ai-model-designs-the-genetic-code-across-all-domains-of-life/) / [News-Medical](https://www.news-medical.net/news/20260305/AI-trained-on-9-trillion-DNA-letters-predicts-harmful-mutations-and-designs-new-genomes.aspx)
- 数学: [The Neuron](https://www.theneuron.ai/explainer-articles/from-erdos-to-axiom-the-open-problems-ai-has-actually-solved/) / [eWeek](https://eweek.com/news/axiomprover-solves-open-math-conjecture) / [arXiv:2605.22763](https://arxiv.org/abs/2605.22763) / [noze.it](https://www.noze.it/en/insights/mathematics-lean-certificate-verifiable/)
- 解釈可能性: [arXiv:2601.03047](https://arxiv.org/abs/2601.03047v1) / [arXiv:2605.23036](https://arxiv.org/html/2605.23036)
- モデル: [ThursdAI Nov 2026](https://thursdai.news/releases/2026-11) / [nocode.mba tracker](https://www.nocode.mba/ai-release-tracker/2026/11) / [Sebastian Raschka](https://sebastianraschka.com/blog/2026/notable-open-weight-models-this-week.html)
