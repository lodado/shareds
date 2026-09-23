# AI tells: what to look for and when to act

A tell is a default choice: the phrasing that fits the widest range of readers instead of this reader and this subject. Tells come in two opposite extremes. The older one pads: announcements, stock words, translationese, recaps. The newer one strips: bare results in short, same-ending sentences with no person behind them, which is what models produce when told to sound less like AI. The common groups are staging (announcing instead of saying), rhythm by rule, inflation, formatting by rule and chat leftovers (Wikipedia: Signs of AI writing; humanizer 3.0.0). Word lists drift with every model generation, while the structural habits persist (Kobak et al. 2025; Wikipedia era lists). `scripts/check_draft.py` counts the countable families. The host judges the rest.

## When to act

1. Strong tells justify an edit on one sighting: staged openers, chat leftovers and engagement bait.
2. Weak tells justify an edit only when a second family appears within three consecutive sentences. This is the Wikipedia cleanup rule, and it keeps ordinary human prose from being flagged. The window is sentences, not paragraphs, because Korean blogs often give each sentence its own paragraph.
3. Recurrent tells justify an edit when they repeat: at least twice and in more than 8% of sentences. For the Korean "A가 아니라 B" this threshold produced about one false hit per 800 human texts (hanlint).
4. A trait supported by the active author profile is never a tell. Author evidence outranks this list.
5. Fixing a tell never changes a claim. Keep hedges that carry real uncertainty, as well as negation, numbers and conditions.

## Families

- Staged opener (strong). "Let's dive in", "In today's fast-paced world", "It's worth noting that", "알아보겠습니다", "살펴보겠습니다", "결론부터 말하자면:". Start with the claim.
- Chat leftover (strong). "Great question", "I hope this helps", "도움이 되었으면 좋겠습니다", "궁금한 점이 있으면 언제든". Delete.
- Engagement bait (strong). "좋아요 부탁", "공감하면", "댓글로 ○ 남겨주세요", "스하리", "맞팔", "RT if". Meta demotes it. Ask a real question instead.
- Negation list (weak). "~이 아닙니다. ~도 아닙니다." before the actual point. Say what the thing is.
- Reader assumption (weak, a warning in the hook position). "~궁금하신 분들이 많으실 겁니다", "한 번쯤 고민해 보셨을 겁니다", "Have you ever". It tells readers nothing, and as a first sentence it becomes the search snippet. Open with the most surprising verified fact.
- Announcer (weak). "핵심은 단순합니다", "이유는 간단하다", "The answer is simple". State the point. How-to posts may keep "방법은 간단해요" when the steps follow at once, which is why it cannot warn alone.
- Contrast frame (recurrent). "not just X but Y", "It's not X, it's Y", "단순한 A가 아니라 B", "A가 아니라 B다". State B with its evidence. Keep the frame once when it refutes a belief the reader actually holds.
- Formatting by rule (recurrent). Bold labels such as "**핵심:**", emoji bullets and bold on every item. AI text uses bold about 43 times as often as people do (Pangram 2025). Write plain sentences.
- Summary closer (weak). "In conclusion", "결론적으로", "요약하자면", "궁극적으로", or a closing moral such as "~해야 할 시점이다". End on the last new fact, the next step or the limit.
- Inflated vocabulary (weak, era-dated 2026-09). delve, tapestry, testament, underscore, pivotal, intricate, meticulous, realm, showcase, seamless, transformative; 다양한, 중요한 역할, 시사하는 바, 주목할 만한, 혁신적, 원활한, 재정의. Replace with the specific noun, number or verb.
- Translationese (weak, Korean). "~를 통해", "~에 있어서", "~에 의해 …되다", "~로부터", "되어지다", "보여지다", "~를 가지고 있다", "~할 필요가 있다". Use the plain verb: "AI를 통해 효율을 높일 수 있다" becomes "AI로 효율을 높인다" (이오덕; 김정선; 한글문화연대).
- Participial rider (weak, English). ", highlighting …", ", ensuring …", ", reflecting …". GPT-4o writes these 5.3 times as often as people (Reinhart et al., PNAS 2025). Give it its own sentence with a subject.
- Hedge stack (weak). "could potentially", "~할 수 있을 것으로 보인다". Keep one hedge that matches the source's certainty.
- Dash density (weak, model-specific). Two em dashes in one sentence. Split it.
- Comma after a Korean connective (measured). "재시작했고, 확인했으며," or a sentence-initial "그리고,". LLM Korean essays put commas in 61% of sentences versus 26% for people (KatFishNet, ACL 2025). Popular human posts reached 49% on the narrower connective count, so the checker warns only from 60%. Drop the comma unless it disambiguates what a modifier attaches to.
- Bare results (narrative genres only). Short sentences that each report a result, a "A에서 B로 줄었다" metric, and no stake, scene, reaction or doubt. `--genre experience` or `--genre opinion` counts five human signals: first person, feeling, uncertainty, spoken trace and causal link. It warns when one or none appears. The cure is `grill-me.md`, not adjectives. In a PR or a reference post, a before-and-after number is exactly what the reader needs.
- Uniform rhythm (measure only). Nearly equal sentence lengths, or one ending on most sentences. No validated threshold exists: GPTZero dropped burstiness and hanlint declined the check. Reread the passage; do not add filler to vary it.

## Not tells

Do not "fix" these:

- Passive voice. LLMs use fewer agentless passives than people (Reinhart et al. 2025). Passive is a clarity question, not an origin signal.
- A single em dash, an ordinary connective, or a three-item list when there are exactly three things.
- Short sentences that carry a judgment or an admission. People write fragment recaps and runs of short confessions. What reads as AI is short sentences carrying only results.
- A consistent register. Steady 합쇼체 or 음슴체 is a register choice. Mixing speech levels inside one text is the tell.
- The author's documented quirks.

## Contrast set

Conditions: the draft states the same facts, keeps every number, and adds no experience the source lacks.

Padded, the older extreme:

```text
이번 프로젝트는 단순한 리팩터링이 아니라, 팀의 개발 문화를 재정의하는 중요한 전환점이었습니다. 이를 통해 다양한 문제를 효율적으로 해결할 수 있었으며, 협업의 질 또한 크게 향상되었습니다. 결론적으로, 이번 경험은 시사하는 바가 큽니다.
```

Stripped, the newer extreme:

```text
리팩터링은 3주 걸렸다. 리뷰가 이틀에서 반나절로 줄었다. 파일이 작아진 게 컸다.
```

Written from the writer's interview answers, with the transcript in `grill-me.md`:

```text
일주일이면 될 줄 알았는데 3주 걸림. 2주차 금요일 밤에 테스트 40개가 한꺼번에 빨간불 떴을 땐 진짜 롤백할까 했는데 이미 절반 넘게 쪼개놔서 아까워서 못 돌림. 매몰비용 ㅋㅋ
끝나고 나니 800줄 넘던 파일이 200줄 안쪽으로 줄었고 이틀씩 걸리던 리뷰가 반나절이면 끝남. 근데 그 사이에 리뷰어도 한 명 늘어서 전부 파일 크기 덕이라고는 못 하겠음.
```

If the writer supplied no scene, feeling or doubt, do not invent one. Ask for it, or keep the post to what the source supports and report the gap.
