# blog-voice-cloner

한국어·영어 블로그에서 **문구가 아닌 글쓰기 결정**을 추출하는 Claude Code/Codex 스킬입니다. 모델 파인튜닝이 아니라, 파일로 저장한 근거 기반 문체 프로필을 매번 읽어 사용합니다. 프로필이 없어도 PR 설명, X·Threads 글, SEO/GEO 블로그 글을 독자가 먼저 필요한 순서로 쓰고 AI 문체를 점검합니다.

## 시작하기

이 폴더 전체를 호스트의 skill 디렉터리에 복사합니다. 예: Claude Code의 `~/.claude/skills/blog-voice-cloner/`, Codex의 `~/.agents/skills/blog-voice-cloner/`. 기존 설치가 있으면 덮어쓰지 말고 버전을 비교하세요. 이 저장소에서는 패키지 플러그인으로도 등록되어 있습니다.

Python 3.10 이상, 표준 라이브러리만 사용합니다. 검색 API와 티스토리에 접속하는 `find_top_posts.py`를 빼면 Python 작업에는 네트워크·API 키가 필요하지 않습니다. 정성 분석과 글 작성은 실행 중인 호스트 모델이 담당하므로 모델 처리까지 오프라인이라는 뜻은 아닙니다.

```text
이 폴더 글들 분석해서 문체 프로필 만들어줘.
이 블로그의 최근 30일 글을 author-a로 등록해줘.
이 내용을 author-a 문체로 새 글로 작성해줘.
내용은 절대 바꾸지 말고 문체만 적용해.
왜 이 글이 원래 문체와 다른지 근거를 보여줘.
앞으로 내 글에서는 비유를 더 적게 써줘.
이 diff로 PR 설명 써줘.
리팩터링 회고 쓰고 싶은데 나 인터뷰해줘.
이 블로그 글을 스레드 5개로 바꿔줘.
이 글 AI 티 나는지 봐줘.
'엔비디아 주가 전망' 상위 글 분석해줘.
```

## 로컬 파일 분석

아래 명령은 이 스킬 디렉터리에서 실행합니다. 어디서든 쓰려면 scripts 경로를 절대 경로로 지정하세요.

```bash
python3 scripts/analyze_style.py ./source-posts --output ./analysis-new
python3 scripts/validate_style.py ./draft.md --corpus ./source-posts --output ./review.json
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

분석기는 문서·블록 ID, 중복 그룹, 문서 단위 분할, PROFILE 집합의 측정 결과를 생성합니다. `references/style-profile.json`은 **정성 분석 대기 상태**로 만들어집니다. Python이 유머나 논리 전개 규칙을 자동으로 이해했다고 꾸미지 않습니다. 호스트가 PROFILE 근거만 읽어 규칙을 채우고 검토해야 합니다.

`validate_style.py --help`에서 중복 임계값·프로필·사실 장부 옵션을 확인하세요. 겹침 없음은 표절 안전이나 의미 보존을 보증하지 않습니다.

## 작성자별 저장과 최근 30일

```bash
python3 scripts/manage_voice.py init --root .blog-voice --author author-a --url https://example.com/blog
python3 scripts/manage_voice.py import --root .blog-voice --author author-a --file ./post.md --url https://example.com/posts/one --published-at 2026-08-20T09:00:00+09:00 --collected-at 2026-09-07T00:00:00+09:00
python3 scripts/manage_voice.py snapshot --root .blog-voice --author author-a --as-of 2026-09-07T00:00:00+09:00 --days 30
```

위 URL·날짜는 사용법 예시입니다. 실제 수집 결과로 바꿔야 합니다. 블로그 수집은 호스트의 허용된 웹 도구로 실행하며 이 스크립트는 이미 받은 파일을 가져옵니다. URL만 넣으면 모든 사이트를 자동 크롤링하는 프로그램이나 백그라운드 스케줄러는 아닙니다.

최근 30일은 시간대가 명시된 기준 시각에서 30×24시간 전까지의 반개구간입니다. 게시일과 수집일은 별개입니다. 날짜를 모르는 글을 기간 안에 있다고 추정하지 않습니다. 상세 절차와 수집 누락 보고는 [collection.md](references/collection.md)를 참고하세요.

```text
.blog-voice/author-a/
├── author.json
├── corpus/                  # 원문 버전과 출처 매니페스트
├── profiles/<version>/      # 기간·문서 분할·측정·문체 프로필
├── active-profile.json      # 검토 후 선택한 프로필
├── user-overrides.json      # 사용자가 명시한 지속적 선호
├── corrections/             # 생성본·수정본·diff·분류
└── runs/                    # 호스트가 저장하는 장부·계획·초안·검토
```

새 스냅샷은 이전 프로필을 자동 교체하지 않습니다. 작은 코퍼스를 사용할 때는 `mode: "exploratory"`를 명시하고 약한 근거 규칙만 담아 검토해야 활성화할 수 있습니다. 이는 검증 완료를 뜻하지 않습니다. 정성 분석·검토를 마친 뒤 `manage_voice.py activate --help`에 따라 활성화합니다. 원문을 추가하거나 글이 수정돼도 기존 버전은 보관합니다. 서로 다른 집합을 연결하는 중복이 발견되면 해당 그룹을 격리해 평가 누출을 막습니다.

개인 코퍼스는 소비 프로젝트의 `.gitignore`에도 `.blog-voice/`를 추가하세요. 코드 저장소에 원문을 자동 커밋하지 않습니다. 새 글은 원문 코퍼스에 자동 편입되지 않습니다.

## 수정 기록

```bash
python3 scripts/manage_voice.py correction --root .blog-voice --author author-a --generated ./draft.md --edited ./edited.md --category STYLE_CORRECTION --reason '이 문단의 비유를 줄임'
```

수정 저장과 선호 학습은 다릅니다. 위 명령은 원본 문체나 사용자 선호를 자동 변경하지 않습니다. “앞으로도 이렇게”라고 명시한 선호만 별도 `user-overrides.json`에 근거와 함께 저장합니다. 내용·사실 수정은 글의 장부에 반영합니다.

## 문체 재현과 익명 검수

한국어는 종결어미 개수만 세지 않고, 정보 설명에서 독자에게 말을 거는 순간의 어체 전환과 거리감 등을 분석합니다. 제목은 `title_craft` 차원으로 실제 제목 블록을 근거로 삼습니다. 작성할 때는 장르와 문단 역할에 맞는 규칙을 작은 `voice-brief.json`으로 정리한 뒤 계획에 반영합니다. 내용이 적으면 같은 주의사항을 반복해 분량을 채우지 않습니다.

동일한 내용으로 작성한 결과를 방법 이름 없이 검수하려면 다음 명령을 사용합니다.

```bash
python3 scripts/build_blind_review.py ./manifest.json --output ./review-new --seed 123
```

매니페스트는 `title`, 선택적 `reference_url`, 선택적 `reference_text`, `cases`를 포함합니다. 각 사례는 `id`, `title`, `brief`, `outputs: [{variant, path}]`를 가집니다. 경로는 매니페스트 기준이며 한 사례에 두 개 이상의 결과가 필요합니다. 자세한 예시는 [evaluation.md](references/evaluation.md)를 참고하세요.

`review-new/review.html`과 미작성 `ratings.json`이 검수용입니다. 방법 대응표인 `private/key.json`은 검수자에게 보여주지 않습니다. 기존 출력 폴더는 덮어쓰지 않습니다. 작성 방식은 숨겨도 글 자체의 표현으로 추측할 수 있으므로 완전한 맹검을 보증하지 않습니다. 자동 검사와 모델 검토는 사람의 문체 선호가 아니며, 실제 검수 전 상태는 `human_review_pending`입니다.

HTML에서 글별 점수·의견과 주제별 선호를 입력한 뒤 JSON을 내려받아 전달하세요. 브라우저 임시 저장은 파일 위치와 브라우저에 따라 달라질 수 있습니다. 원래의 `ratings.json`이 자동 수정되는 것은 아닙니다. 내려받은 평가를 다시 가져올 수도 있습니다. 도구는 Python 표준 라이브러리로 실행하며, 테스트 중 JavaScript 동작 검증은 Node.js가 없으면 건너뜁니다.

## PR·스레드·블로그 글쓰기와 AI 문체 점검

형식마다 독자가 처음 얻어야 할 것이 다릅니다. PR은 리뷰어가 무엇을 확인할지, 스레드는 첫 줄의 구체적인 주장, 블로그는 첫 몇 문장의 답과 근거입니다. [formats.md](references/formats.md)에 형식별 순서·길이·플랫폼 제한과 대조 예시가 있고, [ai-tells.md](references/ai-tells.md)에 AI 문체 계열과 언제 고칠지가 있습니다. 근거 논문과 검증 상태는 [research.md](references/research.md)에 정리했습니다.

경험·회고·의견 글은 쓰기 전에 [grill-me.md](references/grill-me.md) 방식으로 쓰는 사람을 인터뷰합니다. 모델은 기대했던 것, 제일 기억나는 장면, 그때 기분, 진짜 원인, 아직 모르는 것을 지어낼 수 없어서 물어봐야 합니다. 질문은 번호를 붙여 한 번에 몇 개씩 묻고, 답에서 나온 장면이나 숫자를 다음 질문에서 더 파고듭니다. 답변은 글의 내용이 되고, 답변의 말투는 이번 글의 어투 근거가 됩니다.

```bash
python3 scripts/check_draft.py ./pr.md --format pr --diff ./change.diff
python3 scripts/check_draft.py ./thread.md --format thread --platform x
python3 scripts/check_draft.py ./post.md --format blog --genre experience --output ./check.json
```

스레드는 글 사이에 `---` 줄을 넣어 나눕니다. X는 한글을 2자로 세어 280까지, Threads는 글 하나에 500자까지 확인합니다. PR은 이유·검증·리뷰 포인트가 있는지, 설명에 적은 식별자가 diff에 실제로 있는지 봅니다. 블로그는 질문형 소제목 뒤의 바로 답, 폐지된 FAQ/HowTo 스키마, 숫자·링크 유무를 봅니다. `--genre experience`나 `--genre opinion`을 주면 1인칭, 감정, 불확실성, 말투 흔적, 원인 연결이 몇 종류 있는지 세어 하나 이하면 경고합니다. 정리 글은 `--genre reference`로 이 검사를 건너뜁니다.

경고는 검토 입력입니다. AI 판별이나 품질 점수가 아닙니다. 강한 표시(예고형 도입, 채팅 말투, 참여 유도)는 한 번만 나와도 경고하고, 약한 표시는 연달아 이어진 세 문장 안에 다른 계열이 함께 있을 때만 경고합니다. 문장이 셋보다 적으면 통과 대신 `too_short`를 냅니다. 활성 프로필이 뒷받침하는 작성자 습관은 경고보다 우선합니다. 수동태, 대시 하나, 일관된 어체는 AI 표시로 보지 않습니다. 단어 목록은 모델 세대마다 바뀌므로 2026-09 기준입니다.

## 검색용 블로그 글의 claude-seo 검토

검색 유입을 노리는 블로그 글은 초안과 체커 확인이 끝나면 [seo-review.md](references/seo-review.md) 순서로 claude-seo 평가를 받습니다. `claude-seo:seo-content`로 E-E-A-T와 콘텐츠 품질을, `claude-seo:seo-geo`로 AI 검색 인용 가능성을 봅니다. 지적 사항은 반영, 사용자에게 질문, 이유를 적고 기각 중 하나로 나눕니다. 글자 수 목표, 키워드 밀도, FAQ 스키마, llms.txt처럼 근거가 확인되지 않았거나 공식 문서와 어긋나는 권고는 기각합니다. 검토는 최대 두 번이고, 남은 중요 지적이 작성자만 아는 정보라면 더 고쳐 쓰지 않고 질문으로 넘깁니다. claude-seo가 설치돼 있지 않거나 스킬을 부를 수 없는 실행 환경이면 formats.md 체크리스트로 대신하고 외부 검토는 `not_run`으로 남깁니다.

`--keyword "엔비디아 주가 전망"`처럼 검색어를 주면 체커가 제목의 검색어, 첫 문장 훅, 검색 미리보기 문장을 확인합니다. 남은 이미지 자리, 날마다 바뀌는 가격이 든 제목, 표 없이 흩어진 숫자도 알려줍니다.

## 검색 상위 글 분석

검색용 글을 계획하기 전에 같은 검색어로 지금 상위에 있는 글을 재볼 수 있습니다. 절차와 해석 기준은 [top-posts.md](references/top-posts.md)에 있습니다.

```bash
export NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=...   # 또는 KAKAO_REST_API_KEY (--engine daum)
python3 scripts/find_top_posts.py "엔비디아 주가 전망" --engine naver --out ./runs/top-posts
python3 scripts/scan_top_posts.py ./runs/top-posts/*.html --keyword "엔비디아 주가 전망" --output ./runs/top-posts/report.md
```

`find_top_posts.py`는 네이버 검색 API나 카카오(다음) 블로그 검색 API로 상위 글 목록을 받습니다. 키가 없으면 `--urls`로 링크를 순위대로 넘깁니다. 티스토리 글은 블로그마다 robots.txt를 확인하고, 요청 사이에 고정 간격(기본 3초)을 두고 한 번에 하나씩 저장합니다. 네이버 글은 자동으로 받지 않습니다. 네이버 robots.txt가 AI 검색 목적의 봇 접근을 금지하기 때문입니다. 대신 `list.md`에 적힌 `m.blog.naver.com` 링크를 브라우저로 열어 표의 파일 이름으로 저장하면 됩니다.

`scan_top_posts.py`는 저장된 네이버·티스토리 본문의 글자 수, 사진, 소제목, 인용, 표, 동영상, 링크 카드, 첫 블록, 제목과 첫 세 문장의 검색어 위치를 표로 만들고 최솟값·중앙값·최댓값을 붙입니다. 이 숫자는 지금 상위 글이 어떤지 보여줄 뿐이고 목표 분량이 아닙니다. 순위는 블로그의 이력과 주제 집중도도 반영합니다. 보고서에는 상위 글들이 답하는 질문과 아무도 답하지 않은 질문을 덧붙이고, 새 글은 그 빈틈을 겨냥합니다. 상위 글의 사실·경험·문장은 새 글의 내용으로 쓰지 않습니다. 저장한 페이지는 로컬 실행 폴더에만 둡니다.

## 구성 요소

- `SKILL.md`: 요청 라우팅, 데이터 경계, 필수 실행 순서.
- `scripts/analyze_style.py`: 파일 파싱·분할·결정론적 문체 지표.
- `scripts/validate_style.py`: 원문 겹침·근거 연결·보호 문자열 검토.
- `scripts/manage_voice.py`: 작성자별 가져오기·버전·기간 스냅샷·수정 기록.
- `scripts/build_blind_review.py`: 익명 검수 HTML·빈 평가지·분리된 대응표 생성.
- `scripts/check_draft.py`: AI 문체 표시와 PR·스레드·블로그 형식 점검.
- `scripts/find_top_posts.py`, `scan_top_posts.py`: 검색 상위 글 목록·티스토리 저장, 저장된 본문 측정.
- `references/style-profile.{json,md}`: 빈 초기 템플릿. 실제 추론 결과가 아닙니다.
- `references/style-metrics.json`: 빈 측정 템플릿. 실제 결과는 분석 출력 폴더에 생성합니다.
- `references/examples.md`, `evidence.md`, `negative-examples.md`: 역할별 사례, 근거 형식, 피해야 할 모방.
- `references/analysis-guide.md`: 제목을 포함한 11개 분석 차원과 근거·신뢰도 기준.
- `references/language-ko.md`, `voice-brief.md`: 한국어 맥락별 어투와 작성용 문체 결정.
- `references/writing-workflow.md`: 사실 장부, 문체 기반 계획, 독립 검토, 수정 학습.
- `references/evaluation.md`: A~E 비교와 블라인드 사람 평가 절차.
- `references/formats.md`, `ai-tells.md`, `grill-me.md`, `seo-review.md`, `top-posts.md`: 형식별 계약, AI 문체 계열·판정 규칙, 쓰기 전 인터뷰, 검색 검토 루프, 상위 글 분석.
- `tests/`: 파싱·지표·중복·데이터 저장·CLI 회귀 테스트.

## 스키마

프로필은 `global_rules`, `genre_rules`, `weak_observations`, `anti_patterns`로 구성합니다. 규칙의 필수 필드는 다음과 같습니다.

```json
{
  "id": "TRANSITION-02",
  "dimension": "argument_structure",
  "instruction": "타당한 접근을 설명한 뒤 짧은 전환으로 제약을 소개한다.",
  "scope": { "genres": ["technical_explanation"], "roles": ["transition"] },
  "evidence": ["document-example:paragraph-03"],
  "confidence": "weak",
  "exceptions": ["내용에 없는 제약을 만들지 않는다."]
}
```

위 규칙은 스키마 설명용입니다. 실제 근거 포인터로 교체해야 유효합니다. JSON이 정본이며 Markdown은 같은 내용을 사람이 읽도록 정리합니다. 문서·블록 참조는 스냅샷과 원문 버전 안에서 해석합니다.

## 알려진 한계

- 한국어 문장 분리·종결형·대명사/접속어 검출은 휴리스틱입니다. 의미·유머·비유 판단은 자동 측정으로 보장하지 않습니다.
- HTML은 최선 노력 파싱입니다. 복잡한 레이아웃, 중첩 목록, 광고, 댓글은 호스트가 정제 결과를 확인해야 합니다.
- 대형 코퍼스의 문서 중복 그룹 비교는 이차 비용이 들 수 있습니다. 글 수와 길이를 확인하고 무제한 아카이브 전체를 한 번에 분석하지 마세요. 초안 겹침 검사는 전체 작업 예산을 넘으면 미완료 검토로 보고합니다.
- 중복 검사는 탐지 보조입니다. 번역·의미적 바꿔쓰기·짧은 특유 표현을 모두 잡지 못합니다.
- 문서 수가 충분해도 최근 기간이나 장르 편향이 있을 수 있습니다. 작은 코퍼스는 탐색적 분석으로 표시합니다.
- 파일 분리는 모델의 강제 샌드박스가 아닙니다. 평가 자료를 이미 본 컨텍스트를 독립 추출자로 쓰지 마세요.
- 실존 작성자의 사실·경험·의견을 가져오지 않습니다. 사칭·보증 표현 없이 독창적인 글을 작성하고, 공개 사용 시 권리와 플랫폼 조건을 확인하세요.
- 자동 검사 통과는 사람의 문체 선호·수정 비용·법적 안전을 입증하지 않습니다. 실제 평가가 없으면 `not_run`입니다.

## 배포 디렉터리 트리

```text
blog-voice-cloner/
├── SKILL.md
├── README.md
├── scripts/
│   ├── analyze_style.py
│   ├── validate_style.py
│   ├── manage_voice.py
│   ├── build_blind_review.py
│   ├── check_draft.py
│   ├── find_top_posts.py
│   └── scan_top_posts.py
├── references/
│   ├── style-profile.md
│   ├── style-profile.json
│   ├── style-metrics.json
│   ├── examples.md
│   ├── negative-examples.md
│   ├── evidence.md
│   ├── language-ko.md / voice-brief.md
│   ├── formats.md / ai-tells.md / grill-me.md / seo-review.md / top-posts.md
│   └── analysis-guide.md / writing-workflow.md / collection.md / evaluation.md / research.md
├── tests/
│   ├── test_analysis.py
│   ├── test_validation.py
│   ├── test_storage.py
│   ├── test_skill_contract.py
│   ├── test_check_draft.py
│   ├── test_find_top_posts.py / test_scan_top_posts.py
│   └── test_blind_review.py
└── evals/                    # 실행 가능한 데모, A–E 출력, 요구사항별 관찰
```
