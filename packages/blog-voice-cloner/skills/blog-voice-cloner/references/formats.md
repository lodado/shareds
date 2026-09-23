# Format contracts: PR, X/Threads, blog (SEO/GEO)

Use with or without an author profile. The profile decides how the author sounds. The format decides what the reader gets first, how long a unit may be and which platform limits apply. Priority when they conflict: meaning, then platform limits, then the active profile, then these defaults. Sources and verification status are in `research.md`. Every example below is synthetic: its facts illustrate structure and are never content.

## Pick the genre first

- Experience, retrospective, opinion and review posts need a person on the page: a stake, a scene, a reaction, a doubt. Get them with `grill-me.md` and check with `--genre experience` or `--genre opinion`.
- Reference and summary posts earn their value from structure and completeness. The most-liked post in the 2026-09 velog sample was one, with almost no first person. Use `--genre reference`.
- PR descriptions and platform posts follow their contracts below. A thread about your own work is an experience post in short form.

## Rules for every format

1. Put the result first. The first sentence states the change, answer or claim the reader came for, and background follows (BLUF; Google CL descriptions; 44% of ChatGPT-cited passages sit in the first 30% of a page).
2. Be concrete. Name the file, version, number, symptom or place. Concrete wording reads as attention to the reader (Packard & Berger 2021: satisfaction +9% and spending +13% per standard deviation of concreteness).
3. Every sentence adds something the reader does not have yet. Cut run-ups, restatements and recap closers (Rogers & Lasky-Fink: less is more).
4. One claim per sentence. Split chains of two or more connective clauses (국립국어원 2013; KatFishNet 2025).
5. Link sentences by real causes. Put the cause before the effect, and use -어서, -니까 or -더니 only for a causal link the source states. A reason bolted on after the result with -니까 reads backwards.
6. Evidence beats adjectives. A measured number, a link or a quotation replaces "fast", "robust" or "다양한". Missing evidence means ask or omit, never invent (GEO, KDD 2024).
7. Format only what needs it. Use bullets for enumerable items. Bold one name or figure at most. No bold labels and no emoji bullets.
8. Default to declarative titles and hooks. Use a question only when it addresses the reader and the answer is not obvious (Fang & Wheeler 2026).
9. Reveal the subject and the stake, and withhold one thing. A pure teaser and a full spoiler both lose (Aubin Le Quéré & Matias 2025).

## Without a profile

1. Collect CONTENT_SOURCE: the diff and issue for a PR, notes or an existing post for a thread, notes plus sources for a blog post. For an experience or opinion piece, interview the writer with `grill-me.md` before anything else.
2. List each claim with its source: a diff hunk, a note line, or a URL with access date. The ledger rules in `writing-workflow.md` apply: no invented experience, number, result or quote.
3. Draft against the contract below and apply `ai-tells.md` while drafting, not as a later cleanup pass.
4. Run `python3 scripts/check_draft.py DRAFT --format pr|thread|blog`, adding `--diff FILE` for a PR, `--platform x|threads` for posts and `--keyword "PHRASE"` for a blog post meant for search. Fix warnings unless the content or an active profile justifies them, and record what you kept and why.
5. For a blog post meant for search, run the claude-seo review loop in `seo-review.md`.
6. Deliver the draft, unresolved findings and questions about missing facts. Save a run folder only when the user wants history.

## PR description

Reader: a reviewer who did not see your session, may skim, and must decide what to check. Most agent-authored PRs got no human review in a 2026 study (84%, Duma et al.), so the first two lines carry the problem and the risk.

Order:

1. Title: the behavior change, not the activity. `fix(auth): 만료 직후 동시 요청 실패 수정` or an English imperative. English type prefix, Korean noun ending, about 50 characters and 72 at most.
2. First sentence: what changes for the user or the system.
3. Why: the problem or trigger, with the issue link. The reason is the element most often missing (Tian et al. 2022: 44% of messages).
4. How: the approach, a rejected alternative if a reviewer would ask, and known shortcomings (Google eng-practices; Linux kernel).
5. Verification: commands actually run and their results, or manual steps a reviewer can repeat. Say what was not run.
6. Review focus: the file, function or decision to check and the kind of feedback wanted. Across 80K PRs this predicted merging more than any other description element (Pirouzkhah et al. 2026).
7. Risk and rollback, only when real.

Match the diff. Every claimed change exists in it, and every behavior change in it is described. Phantom changes were 45% of inconsistent agent PRs (Gong et al. 2026). Use the repository's PR template headings when one exists, and disclose AI assistance when its policy asks. A description that keeps growing suggests splitting the PR (Zhang et al. 2022).

Cut: per-file walkthrough bullets, "이 PR은 …" narration, restating the diff, a process diary ("먼저 코드를 탐색했고…"), and praise ("견고한", "comprehensive").

AI default:

```text
## 개요
이 PR은 사용자 경험을 향상시키기 위해 로그인 로직을 개선합니다. 이를 통해 보다 안정적이고 효율적인 인증 흐름을 제공할 수 있습니다.
## 변경 사항
- `auth.ts`: 로직 수정
- `retry.ts`: 재시도 추가
## 결론
이번 변경은 단순한 버그 수정이 아니라 인증 구조 전반의 안정성을 높이는 중요한 개선입니다.
```

Reader first:

```text
fix(auth): 만료 직후 동시 요청 실패 수정

토큰이 만료된 직후 요청 두 개가 동시에 나가면 둘 다 재발급을 시도해서 둘 다 401로 실패했습니다(#412).
재발급을 하나로 묶고, 끝날 때까지 나머지 요청을 대기열에서 기다리게 했습니다.

검증: `pnpm test auth` 통과. 만료 5초 전 토큰으로 요청 3개를 동시에 보내 재발급 1회, 성공 3회를 확인했습니다.
봐 주세요: `retryQueue`가 재발급 실패 때 대기 요청을 모두 reject하는지. 실패 후 재시도는 이번 범위 밖입니다.
```

## X and Threads

Platform facts:

- X counts 280 weighted characters. Hangul weighs 2, so a Korean post holds about 140 characters, and a URL counts 23 (twitter-text v3).
- Threads allows 500 characters per post (Threads API).
- X's 2026 ranking weighs copy-link shares at 20, replies, quotes and DM shares at 5, reposts at 1 and profile clicks at 0 (xai-org param.rs). Write something worth sending or answering, not something to like.
- On Threads, replies account for almost half of views and reply likelihood is a ranked prediction. Explicit requests for likes, comments, tags or follows are demoted as engagement bait (Meta).

Hook, the first line:

1. A concrete claim with a stake: a number, a mistake or a result. Withhold exactly one thing, usually the cause or the method.
2. Negative framing lifts clicks (+2.3% per negative word in Upworthy tests), while shares follow high-arousal usefulness or awe (Berger & Milkman 2012). Name the concrete mistake, then deliver the fix. No outrage.
3. No bait: 좋아요 부탁, 공감하면, 댓글로 ○ 남겨주세요, 스하리, 맞팔, "RT if". A call to action asks for one specific, useful thing.
4. Invite a reply the reader can give in one line, such as their own number or a real disagreement. Then answer replies. Author replies went with 42% more engagement in an observational study (Buffer 2026).

Thread architecture, from the structure of a user-supplied Korean thread (2026-09). Its sentences are not a template. A thread about your own work needs the interview too:

1. Post 1: the claim, one reframing sentence that the thread will prove, and an implicit promise of N items.
2. Posts 2 to N-1: `k/ 소제목`, one idea per post, each with a payload the reader can use now: a prompt, a command, a number or an example.
3. A numbered recap only when the thread runs past six posts.
4. Last post: call back to post 1's claim with the consequence. No bait.
5. Break lines at clause boundaries. Keep the account's register (음슴체, 반말, 해요체) consistent; an active profile decides which.

Separate posts with a `---` line so `check_draft.py --format thread` can count each one.

AI default hook:

```text
🚀 AI 시대, PR 리뷰는 어떻게 달라지고 있을까요? 오늘은 리뷰 속도를 높이는 다양한 방법에 대해 알아보겠습니다! 👇 공감되시면 좋아요 부탁드려요 🙏
```

Bare results, the other AI extreme:

```text
PR 설명에 한 줄을 더 쓰기 시작한 뒤로 리뷰 요청이 덜 밀린다.
코드는 그대로다. 바뀐 건 마지막 줄.
```

Written from interview answers (assumed: review wait of two days annoyed the writer, one added line, wait under a day after three weeks, the writer is unsure the line caused it, first comments now land on the named question):

```text
리뷰 대기 이틀이 너무 짜증나서 PR 설명 끝에 한 줄을 넣기 시작했음.
3주 지나니까 대기가 하루 안쪽으로 줄었는데 솔직히 그 한 줄 덕인지는 반반임.
그래도 계속 쓸 거임. 이유는 3개
1/4

---

1/ 리뷰어가 어디부터 볼지 안 헤맴
"봐 주세요: retry.ts 대기열이 실패 때 전부 reject하는지" 이렇게 파일이랑 질문을 같이 박아둠.
그러니까 첫 코멘트가 딱 그 질문에 달림.
```

## Blog: SEO and GEO

Verified platform behavior:

- Google needs no special AI markup, files or writing style. It ignores llms.txt, has no ideal length or heading count, and does not need content chunked for AI (Google Search Central, 2025-12 and 2026-07).
- FAQ and HowTo rich results are gone: restricted in 2023-09 and removed in 2026-05. Do not add that markup.
- `BlogPosting` JSON-LD with headline, author name and URL, datePublished, dateModified and image is supported, and values must match the visible page. Adding schema alone left AI citations flat (Ahrefs 2026, 1,885 pages).
- Google rewrites titles that are half empty, outdated, repetitive or unclear. Keep one main title that literally summarizes the page.
- AI engines cite pages with clear summaries, Q&A-shaped sections and visible structure (Semrush 2026). Real quotations, statistics and cited sources raised visibility by 41%, 31% and 27% in the GEO benchmark, while keyword stuffing fell below baseline (KDD 2024).
- Only 38% of AI Overview citations came from the top 10 results after Gemini 3 (Ahrefs 2026). Cover the follow-up questions a reader asks next.
- Freshness is engine-specific. Bump dateModified only with a substantive change, because a date-only change is a Google red flag.

Structure:

1. One main title stating literally what the reader gets. No repeated keyword, no stale year. Where the platform has a separate title field (velog, Naver, Tistory), start body headings at level 2.
2. First two to four sentences: the answer or result. Context comes after.
3. H2s: the reader's follow-up questions. Answer each in the first sentence below it, and make each section self-contained by naming the tool, version or subject instead of "이것" or "this".
4. Every section carries evidence: a number, a code run, a link or a quote. Mark estimates as estimates.
5. At least one original element: your measurement, reproduction, screenshot or failure. A page without one repeats what already ranks (Google helpful content).
6. Ending: what to do next, or the limit of the result. No recap paragraph.

Title, hook and search snippet:

1. Take the phrase readers type from the search box. Check Naver and Google autocomplete for the seed keyword with the host's web tools, and put that phrase near the start of the title. Autocomplete shows phrasing, not search volume, so never state a volume you did not measure.
2. The title states the tension and one concrete number, and keeps the reason for the body. Avoid a number that changes daily, such as today's stock price, unless the post is dated news. Google rewrites outdated titles.
3. The first body sentence is the hook: the most surprising verified fact, with the keyword in it. In the 2026-09 sample, Naver showed the sentence around the query term as the search snippet, so a generic first sentence becomes the preview. Never open by assuming what readers wonder ("~궁금하신 분들이 많으실 겁니다").
4. Paid or affiliate disclosure goes on the first line or at the end, visibly separate from the body (공정거래위원회 추천·보증 심사지침). An unpaid conflict of interest, such as owning the stock you write about, goes right after the hook and before the first claim.

Numbers, periods and units:

- Gather three or more comparable figures into one table with periods as columns. Keep the reasoning in prose.
- Name periods exactly. Where a company's fiscal year differs from the calendar, write the fiscal quarter and its end date, because "2분기" alone misleads.
- When searches ask for the reader's unit, such as the price in won, add it with the rate and date you used on publishing day.

Money, health and law posts (YMYL):

- Google applies its highest trust bar to these topics. Add first-hand evidence the writer can show: dates, what they did during a drawdown, a screenshot with amounts hidden. Get it through `grill-me.md` and never invent it.
- Keep the disclosure, the risks section, the sources and the date. A buy or sell stance stays the writer's, stated as opinion.

A tech-post narrative that holds attention: situation (environment, symptom, number), then attempts as named hypotheses with the reason each failed, then the actual cause, the fix and its limits. Put the symptom in the first three sentences. Present failed attempts as problem and outcome pairs, not a diary (김철수, 개발자의 글쓰기).

Structures observed in popular Korean posts (2026-09 sample, `research.md`):

- Experience or retrospective: the trigger, episodes in time order, today's honest judgment, a short sign-off. Headings are questions or feelings, often the reader's objection answered below.
- Company tech post: who the writer is and the problem, who should read it, attempts and doubts, the decision, what deployment taught, references.
- Summary or reference: numbered criteria with code, little first person. The structure is the value.
- Naver review: the verdict in the title, frequent line breaks for mobile, 음슴체 and 해요체 mixed, a disclosure line on top for affiliate posts.

For one keyword, `top-posts.md` measures what ranks now and finds the questions no post answers. Its numbers describe the sample; they are never targets.

Myths to reject: keyword counts or density, word-count targets, llms.txt, FAQ schema for rich results, schema as the only GEO change, date bumps without changes, and chunking for AI. Naver's C-Rank and D.I.A. reward topic consistency and first-hand information according to secondary sources only, so do not state Naver rules as verified.

AI default opening:

```text
오늘날 빠르게 변화하는 웹 개발 환경에서 성능 최적화는 매우 중요한 역할을 합니다. 이번 글에서는 Next.js 캐싱에 대해 자세히 알아보겠습니다.
```

Bare results, the other AI extreme:

```text
배포 직후 p95 응답 시간이 3초로 튀었다. 원인은 Next.js 15에서 fetch가 기본으로 캐시하지 않게 바뀐 것이었다. 설정 한 줄로 280ms로 돌아왔고, 그 전에 틀린 가설 두 개를 버렸다.
```

Written from interview answers (assumed: the spike came ten minutes after deploy, the writer spent an hour on DB indexes first, felt deflated by a one-line fix, and has not checked other pages yet):

```text
배포하고 10분 만에 p95가 3초로 튀었다. DB부터 의심해서 인덱스를 한 시간 동안 들여다봤는데 거긴 멀쩡했다. 범인은 Next.js 15에서 fetch가 기본으로 캐시를 안 하게 바뀐 거였다. fetch에 cache 옵션 한 줄을 넣으니 280ms로 돌아왔고 좀 허탈했다. 다른 페이지도 같은 영향을 받는지는 아직 다 확인하지 못했다.
```

## One source, many formats

To turn one post into a thread, a PR or a newsletter:

1. Build one claim ledger. Each output uses only its own claims.
2. Apply each format's contract separately. Never paste the blog introduction into the thread hook.
3. The thread hook takes the single most surprising verified claim, the blog carries the evidence, and a PR carries only what its diff does.
4. Run `check_draft.py` on each output with its own `--format`.

To refresh an existing post, the user supplies the data, such as Search Console impressions, clicks and queries. Fix the title and opening of pages with impressions but few clicks. Add original evidence to pages with traffic but no engagement. Never invent metrics.
