# Prior approaches inspected

Documentation inspected 2026-09-07 before implementation, not exhaustive source audits.

| Source                                                                                      | Useful architectural idea                                                     | Limit of evidence / our decision                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [personal-humanizer-maker](https://github.com/TaewoooPark/personal-humanizer-maker)         | Deterministic profiler, qualitative axes, reusable artifact, meaning covenant | One-document profiling and numeric-band convergence do not prove generalization or semantic fidelity. Store metrics as data, not baked author code.                                                                                 |
| [Style Alchemy](https://github.com/snowmays/style-alchemy/blob/main/README.en.md)           | Portable editable profile and core/genre layers                               | README foregrounds signature phrases/power verbs and lists overlap checks as roadmap. Transfer mechanics, not phrases or stronger verbs.                                                                                            |
| [authentic-style-writer](https://github.com/StayInno/authentic-style-writer)                | Evidence card → actionable style brief and contextual constructions           | Canonical repository located in follow-up, correcting earlier unresolved search. Inspected master SKILL.md. Do not import fixed diversity targets, sample-absence prohibitions, construction quotas or detection-resistance scores. |
| [Writing Voice Skill Maker](https://github.com/rehanzaidi/writing-voice-skill-maker-claude) | Actual edits, context-specific profiles, versioned refinement                 | README reviewed. Self-reported user preference is not source-author evidence; keep overrides separate.                                                                                                                              |
| [writing-style-skill](https://github.com/izharr99/writing-style-skill)                      | Confirm voice with short case outputs, preserve deliberate quirks             | Embedded prompt reviewed. Do not inherit unsupported accuracy claims or generic punctuation bans.                                                                                                                                   |
| [Humanizer](https://github.com/blader/humanizer)                                            | Optional filler/unsupported-claim review                                      | README reviewed. A generic cleanup pass can erase genuine author traits; never make it the target-voice metric.                                                                                                                     |

## Research informing the bounded candidate

Inspected 2026-09-07. These findings motivate experiments; they do not establish Korean-blog performance for this implementation.

| Source                                                                                | Inspected evidence                    | Application and limit                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [STYLL / Low-Resource Authorship Style Transfer](https://arxiv.org/html/2212.08986v3) | Abstract and evaluation section       | Separate moving away from source style, moving toward target style and meaning preservation. Authorship representations can encode topic as well as style. No universal similarity percentage.   |
| [Trial-Error-Explain ICL](https://arxiv.org/html/2502.08972v3)                        | Abstract and method                   | Reuse observed failures plus explanations in a bounded development prompt, without fine-tuning. Reported gains use specific models/data and largely LLM judging, not a guarantee for this skill. |
| [Catch Me If You Can? Not Yet](https://arxiv.org/html/2509.14543v1)                   | Abstract, method and early results    | Informal blogs remain challenging; examples and topic effects need controls. Use multiple evidence axes rather than AI detection as the goal.                                                    |
| [LaMP](https://arxiv.org/abs/2304.11406)                                              | Abstract                              | Retrieval of relevant personal items motivates bounded example selection. Role-first selection here is a design hypothesis, not a proven LaMP result.                                            |
| [TinyStyler](https://arxiv.org/abs/2406.15586)                                        | Abstract                              | Authorship embeddings and an 800M model are a future alternative, not a current dependency. Korean applicability unverified.                                                                     |
| [TST evaluation standardization](https://arxiv.org/abs/2306.00539)                    | Abstract, Findings of ACL 2023 status | Automatic evaluation has standardization and human-validation gaps. Preserve separate axes and collect user judgments.                                                                           |

No source code or distinctive source passages were copied into this implementation. Documentation statements describe the inspected versions and may change upstream.

## Reader-first formats and AI tells (2026-09-23)

Sources behind `formats.md`, `ai-tells.md` and `scripts/check_draft.py`. Status: **verified** means a separate check fetched the page and confirmed the cited numbers. **fetched** means the researcher read the page but no second check ran. **secondary** means only a summary or a report about the source was read. Findings are hypotheses for this skill, not measured results for it.

SEO and GEO:

- verified: [Google Search Central, AI features](https://developers.google.com/search/docs/appearance/ai-features), [AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [title links](https://developers.google.com/search/docs/appearance/title-link), [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [FAQ/HowTo changelog](https://developers.google.com/search/docs/appearance/structured-data/faqpage).
- verified: [GEO, Aggarwal et al., KDD 2024](https://arxiv.org/html/2311.09735v3). Relative gains on a GPT-3.5 engine, largest for low-ranked sources.
- verified: Ahrefs [AI Overview citations and top 10](https://ahrefs.com/blog/ai-overview-citations-top-10) (partly), [schema difference-in-differences](https://ahrefs.com/blog/schema-ai-citations/), [freshness](https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content/); [Semrush AI search study](https://www.semrush.com/blog/content-optimization-ai-search-study/). Vendor studies, observational.
- secondary: [Indig via Search Engine Land](https://searchengineland.com/chatgpt-citations-content-study-469483) for the first-30% figure; Naver C-Rank and D.I.A. (official pages could not be fetched).

PR descriptions:

- fetched: [Google CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html), [Linux kernel submitting patches](https://www.kernel.org/doc/html/latest/process/submitting-patches.html), [GitHub PR best practices](https://docs.github.com/en/enterprise-cloud@latest/pull-requests/collaborating-with-pull-requests/getting-started/best-practices-for-pull-requests), [Beams](https://cbea.ms/git-commit/), [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- fetched: [Tian et al., ICSE 2022](https://arxiv.org/abs/2202.02974), [Pirouzkhah et al., MSR 2026](https://arxiv.org/abs/2602.14611), [Gong et al., MSR 2026](https://arxiv.org/html/2601.04886v2), [Xiao et al., FSE 2024](https://arxiv.org/html/2402.08967), [Duma et al., EASE 2026](https://arxiv.org/html/2605.02273), [Zhang et al., EMSE 2022](https://research.rug.nl/files/235173711/s10664_022_10143_4.pdf), [Kudrjavets et al., MSR 2022](https://arxiv.org/abs/2203.05045), [Hora & Robbes, ICSME 2026](https://arxiv.org/abs/2605.16706).
- Contradictions kept open: PR size predicts rejection (Tsay 2014) but not merge time (Kudrjavets 2022). Description length tracks latency (Zhang 2022) yet longer Copilot descriptions merged faster (Xiao 2024). No study tests the first sentence or the why/what order directly.

Hooks and platforms:

- verified in this session: [twitter-text v3 config](https://raw.githubusercontent.com/twitter/twitter-text/master/config/v3.json) (Hangul weight 2), [Threads API overview](https://developers.facebook.com/docs/threads/overview) (500 characters).
- fetched: [X param.rs 2026](https://raw.githubusercontent.com/xai-org/x-algorithm/main/home-mixer/params/param.rs), [Meta engagement bait guideline](https://transparency.meta.com/features/approach-to-ranking/content-distribution-guidelines/engagement-bait/), [Threads feed system card](https://transparency.meta.com/features/explaining-ranking/ig-threads-feed/), [Threads insights](https://about.fb.com/news/2024/10/find-your-community-with-new-threads-educational-insights/), [Robertson et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10202797/), [Berger & Milkman 2012](http://jonahberger.com/wp-content/uploads/2013/02/ViralityB.pdf), [Buffer 2026](https://buffer.com/resources/threads-comments-engagement/) (observational).
- fetched, abstract only: Fang & Wheeler 2026 (question titles, DOI 10.1002/jcpy.70031); Aubin Le Quéré & Matias 2025 (curiosity gaps, DOI 10.1038/s41598-024-81575-9). secondary: Lai & Farbrot 2014 via BPS Research Digest.
- Not established: effects of line breaks, "see more" expansion rates, Korean platform norms beyond practitioner essays.

Immersion and readability:

- verified in this session: [Packard & Berger, JCR 2021](https://academic.oup.com/jcr/article/47/5/787/5873524) (concreteness, perceived listening), [Rogers & Lasky-Fink principles](https://www.writingforbusyreaders.com/business-writing-book/).
- verified: [Paul Graham, Write Like You Talk](https://paulgraham.com/talk.html), [BLUF](<https://en.wikipedia.org/wiki/BLUF_(communication)>).

AI tells:

- fetched: [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), [humanizer 3.0.0](https://github.com/blader/humanizer), [Pangram](https://www.pangram.com/signs-of-ai-writing), [Kobak et al. 2025](https://arxiv.org/abs/2406.07016), [Reinhart et al., PNAS 2025](https://arxiv.org/abs/2410.16107), [SlopMonster](https://github.com/ItsssssJack/SlopMonster), [hanlint](https://github.com/eddmpython/hanlint).
- fetched, Korean: [KatFishNet, ACL 2025](https://arxiv.org/abs/2503.00032), [박종향·김은영 2025](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART003291987), [im-not-ai](https://github.com/epoko77-ai/im-not-ai), [한글문화연대 번역 투](https://www.urimal.org/4544), [토스 technical-writing.dev](https://technical-writing.dev/sentence/subject.html), 국립국어원 『바르고 쉬운 공공언어』 2013. secondary: 이오덕 via 한국일보 column, 김정선 2016 and 김철수 『개발자의 글쓰기』 via reader summaries, 나무위키 meme page.
- Open: no validated sentence-length variance threshold in either language. Word lists go stale within a model generation. The Korean sentence-length direction conflicts between KatFishNet (longer) and 박종향·김은영 (shorter); both find uniformity.

The user-supplied Korean Threads example (2026-09) informed the thread architecture only. Its text is not stored in this skill.

## Popular Korean posts and the interview step (2026-09-23)

Comparison sample, read locally and not stored in this skill: velog monthly trending top 10 (v3 GraphQL), Naver blog topic top posts for IT·컴퓨터 and 일상·생각 (9 each, `DirectoryTopPostList`), and Tistory home popular posts (4 of 5 bodies extracted). Likes or popularity rank are platform signals, not a quality measure.

- Per-post median share of sentences with each human signal, velog / Naver IT / Naver daily / Tistory: causal connective 23 / 5 / 8 / 16, first person 13 / 4 / 7 / 9, feeling 7 / 3 / 5 / 3, uncertainty 7 / 3 / 3 / 3, spoken trace 10 / 6 / 16 / 11 percent. The bare-result examples this skill once shipped scored 0 on all five. Naver writers break one sentence over several lines, which undercounts connectives there.
- Kinds present per post: most human posts showed 3 to 5 of the five kinds. The lowest-liked velog post showed 2 and was the most AI-like in the sample (an announcer plus a negation list). The most-liked velog post, a code-style summary, also showed 2, which is why reference posts skip the check.
- False-positive audit of `check_draft.py --format blog --genre experience` on 33 human posts: 4 posts produced a warning. Two are defensible (the AI-like post, a promo asking for comments); one is a company post where two tells co-occurred; one is an information post that belongs under `--genre reference`. The same audit moved the comma warning to 60%, above the human maximum of 49%, dropped "재정의" (it means "override" in programming), made "방법은 간단해요" weak, and demoted multiple H1 to info because velog bodies use `#` under a separate title field.
- Interview method: adapted from the `grilling` and `writing-fragments` skills in [mattpocock/skills](https://github.com/mattpocock/skills) (read via the GitHub API on 2026-09-23). Taken: rounds of independent questions, recommended answers for decisions, facts looked up rather than asked, no action before confirmation. Changed: no guessed answers for memories or feelings, because an accepted guess becomes invented experience.
- Limits: one snapshot per platform, regex signals, no human rating of the rewritten examples yet. These numbers tune warnings; they do not show that a draft passing them reads as human.

## Search review loop (2026-09-23)

Evidence behind `seo-review.md` and the title, hook and snippet rules in `formats.md`:

- Snippet: for the query "엔비디아 주가", Naver's search-list snippet showed the sentence around the query term, not always the first line (four of the ten latest posts checked through `section.blog.naver.com` SearchList). Observation of one query on one day, not a documented rule.
- Query phrasing: Naver autocomplete for "엔비디아 주가" listed "엔비디아 주가 전망" and "엔비디아 주가 원화 가격", and no "매수" phrasing. Autocomplete shows phrasing, not volume.
- Disclosure placement: 공정거래위원회 「추천·보증 등에 관한 표시·광고 심사지침」 puts paid-endorsement text at the first or last part of a post, visibly separate ([law.go.kr](https://www.law.go.kr/행정규칙/추천·보증등에관한표시·광고심사지침), read through the local blog-post-writing skill's reference). An unpaid holding disclosure is a trust signal rather than a legal requirement.
- claude-seo 2.2.5 skills (`seo`, `seo-content`, `seo-geo`) take a URL but evaluated an unpublished draft file when told it was unpublished. Their 1,500-word blog gate and 134-167-word passage target conflict with Google's statements that no ideal length exists and chunking is unnecessary, so the loop rejects them. The skills themselves say to defer to Google on such conflicts.
- Dry run on a stock post: one review round moved the keyword into the title and first sentence, added a comparison table, a fiscal-quarter label, a won price and a direct quote. The remaining High finding, first-hand experience, needed the writer, so the second round was skipped. The claude-seo scores, E-E-A-T 51/100 and pre-publish GEO 62/100, are that skill's heuristics, not Google signals.
