# blog-voice-cloner

한국어·영어 블로그에서 **문구가 아닌 글쓰기 결정**을 추출하는 Claude Code/Codex 스킬입니다. 모델 파인튜닝이 아니라, 파일로 저장한 근거 기반 문체 프로필을 매번 읽어 사용합니다.

## 시작하기

이 폴더 전체를 호스트의 skill 디렉터리에 복사합니다. 예: Claude Code의 `~/.claude/skills/blog-voice-cloner/`, Codex의 `~/.agents/skills/blog-voice-cloner/`. 기존 설치가 있으면 덮어쓰지 말고 버전을 비교하세요. 이 저장소에서는 패키지 플러그인으로도 등록되어 있습니다.

Python 3.10 이상, 표준 라이브러리만 사용합니다. Python 작업에는 네트워크·LLM API 키가 필요하지 않습니다. 정성 분석과 글 작성은 실행 중인 호스트 모델이 담당하므로 모델 처리까지 오프라인이라는 뜻은 아닙니다.

```text
이 폴더 글들 분석해서 문체 프로필 만들어줘.
이 블로그의 최근 30일 글을 author-a로 등록해줘.
이 내용을 author-a 문체로 새 글로 작성해줘.
내용은 절대 바꾸지 말고 문체만 적용해.
왜 이 글이 원래 문체와 다른지 근거를 보여줘.
앞으로 내 글에서는 비유를 더 적게 써줘.
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

## 구성 요소

- `SKILL.md`: 요청 라우팅, 데이터 경계, 필수 실행 순서.
- `scripts/analyze_style.py`: 파일 파싱·분할·결정론적 문체 지표.
- `scripts/validate_style.py`: 원문 겹침·근거 연결·보호 문자열 검토.
- `scripts/manage_voice.py`: 작성자별 가져오기·버전·기간 스냅샷·수정 기록.
- `references/style-profile.{json,md}`: 빈 초기 템플릿. 실제 추론 결과가 아닙니다.
- `references/style-metrics.json`: 빈 측정 템플릿. 실제 결과는 분석 출력 폴더에 생성합니다.
- `references/examples.md`, `evidence.md`, `negative-examples.md`: 역할별 사례, 근거 형식, 피해야 할 모방.
- `references/analysis-guide.md`: 10개 분석 차원과 근거·신뢰도 기준.
- `references/writing-workflow.md`: 사실 장부, 문체 기반 계획, 독립 검토, 수정 학습.
- `references/evaluation.md`: A~E 비교와 블라인드 사람 평가 절차.
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
│   └── manage_voice.py
├── references/
│   ├── style-profile.md
│   ├── style-profile.json
│   ├── style-metrics.json
│   ├── examples.md
│   ├── negative-examples.md
│   ├── evidence.md
│   └── analysis-guide.md / writing-workflow.md / collection.md / evaluation.md / research.md
├── tests/
│   ├── test_analysis.py
│   ├── test_validation.py
│   ├── test_storage.py
│   └── test_skill_contract.py
└── evals/                    # 실행 가능한 데모, A–E 출력, 요구사항별 관찰
```
