# Grill the writer before drafting

A reader recognizes a person by the stake, the scene, the reaction to a number, the real cause and the doubt that is left. A model cannot supply any of these; it can only ask. Without them a draft falls to one of two AI extremes: padded abstraction, or bare results stacked in short sentences. Popular Korean posts sampled in 2026-09 showed three to five kinds of human signal; bare-result drafts showed none (`research.md`).

The interview also supplies the voice. The writer's answers are the best voice sample available without a corpus: their endings, fillers, jokes, swearing and how they refer to themselves.

## When

- Grill by default for experience, retrospective, opinion and review posts, and for threads about the writer's own work.
- For a PR, read the diff and history first and ask only for what they cannot show: why, risk, what was not tested, where the reviewer should look.
- Skip for reference and summary posts and for strict rewrites, where content is fixed.
- If the user says "그냥 써" or "질문 없이", draft with what exists and list the empty slots in the delivery.

## How

Adapted from the grilling skill in mattpocock/skills.

1. Work in rounds. Ask every question that does not depend on an unanswered one, numbered, three to five per round, then wait.
2. Give a recommended answer only for decisions: audience, register, what to hide, how to end. Never guess a memory or a feeling. Show the shape of the answer instead, such as "언제, 어디서, 화면에 뭐가 떠 있었는지".
3. Follow the branch. When an answer mentions a moment, a person, a number or a feeling, the next round digs into it before moving on.
4. Ask for the scene, not the summary. "그때 화면에 뭐가 떠 있었어요?" gets more than "어떤 문제가 있었나요?".
5. Facts are your job. Never ask what the repository, the diff, the notes or a link already answers.
6. Keep answers verbatim. They become CONTENT_SOURCE, with each item pointing to its question, and their phrases are voice evidence for this run.
7. After each round, show one short list of what was captured and what is still empty.
8. Stop when every slot the genre needs is filled or marked 모름, or when the user says 그만. Show the material once and draft only after the user confirms.
9. Ask before naming people, companies, salaries or health details, and offer to blur them.

## Slots

Round 1 needs nothing earlier:

- 독자: 누가 읽었으면 해요? Recommend one, such as "나랑 비슷한 연차 개발자".
- 계기: 왜 지금 이 글을 써요? 무슨 일이 있었어요?
- 한 줄: 결국 하고 싶은 말은?
- 어투: 해라체, 해요체, 음슴체, 반말 중 어느 쪽? ㅋㅋ, 욕, 이모티콘, 취소선 속마음은 괜찮아요? Recommend the register the user is chatting in, and ask for links to their past posts if they want their blog voice.
- 장면: 제일 기억나는 순간 하나. 언제, 어디서, 뭘 보고 뭘 했어요?

Later rounds follow the answers:

- 기대와 현실: 처음엔 어떻게 될 줄 알았어요? 실제로는?
- 숫자와 체감: 기간, 횟수, 크기와 그게 어떻게 느껴졌는지. 길었어요, 의외였어요?
- 감정: 그 순간 기분, 지금 돌아보면 기분. 욕이 나왔으면 그대로.
- 삽질: 틀렸던 가설, 버린 방법, 버린 이유.
- 진짜 원인: 결국 뭐가 먹혔고 왜 그렇다고 생각해요? 얼마나 확신해요? 다른 요인은 없었어요?
- 남은 의문: 아직 모르는 것, 안 풀린 것, 반례.
- 반론: 읽는 사람이 "그럼 이렇게 하면 되잖아" 할 만한 것과 답.
- 마무리: 다음 계획, 여운, 감사 중 어떻게 끝낼까요?

## Writing from the answers

- Put cause before effect, and use a connective ending such as -어서, -니까 or -더니 only for a causal link the writer stated.
- Numbers keep the reaction the writer gave: "3주나", "이틀씩". Never add one.
- If the writer said "반반" about a cause, write the doubt. It is the most human sentence in the post.
- Reuse the writer's own phrases where they fit. They are the writer's content, not borrowed prose.
- One scene per section beats three summaries.
- Record register choices as run-scoped user decisions. Persist them to `user-overrides.json` only when the writer says 앞으로도.
- Run `scripts/check_draft.py DRAFT --format blog --genre experience`. A `thin_human_signal` finding means another round of questions, not more adjectives.

## Example

Synthetic answers, not evidence:

```text
1 독자? → 리팩터링 할지 말지 고민하는 팀
2 계기? → 팀에서 리팩터링 하자 말자 싸우는 중 ㅋㅋ
3 어투? → 지금 말투대로. ㅋㅋ는 조금만
4 처음 예상? → 일주일? 근데 3주 걸림
5 제일 괴로웠던 순간? → 2주차 금요일 밤에 테스트 40개 빨간불. 진짜 롤백할까 했음
6 왜 안 했어요? → 이미 절반 넘게 쪼개놔서 아까웠음. 매몰비용 ㅋㅋ
7 끝나고 달라진 건? → 800줄 넘던 파일이 200줄 안쪽. 리뷰 이틀 걸리던 게 반나절
8 파일 크기 덕이라고 확신해요? → 반반. 그 사이 리뷰어가 한 명 늘었음
```

Bare results, what a model writes without the interview:

```text
리팩터링은 3주 걸렸다. 리뷰가 이틀에서 반나절로 줄었다. 파일이 작아진 게 컸다.
```

Written from the answers:

```text
리팩터링 하자 말자로 팀에서 싸우는 중이라 해본 사람으로서 썰 풀어봄.
일주일이면 될 줄 알았는데 3주 걸림. 2주차 금요일 밤에 테스트 40개가 한꺼번에 빨간불 떴을 땐 진짜 롤백할까 했는데 이미 절반 넘게 쪼개놔서 아까워서 못 돌림. 매몰비용 ㅋㅋ
끝나고 나니 800줄 넘던 파일이 200줄 안쪽으로 줄었고 이틀씩 걸리던 리뷰가 반나절이면 끝남. 근데 그 사이에 리뷰어도 한 명 늘어서 전부 파일 크기 덕이라고는 못 하겠음.
```
