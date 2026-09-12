# Generation-first — 구현과 부분 baseline 기록

**구현은 로컬 검증했지만 미감 개선·비교 평가·사용자 승인을 입증한 결과는 아니다.**
Codex baseline은 6회 중 3회 HTML 생성까지 종료했고, 나머지는 사용량 제한으로 실패했다.
대체 Claude smoke도 주간 제한으로 실패했다. Candidate 생성·AB/BA 심판·사람 보정은 수행하지 않았다.

## 변경

- `SKILL.md`: 179줄에서 51줄로 축소. 상시 참조 연쇄 대신 조건부 로드와 네 단계 생성 루프.
- `art-direction.md`: 실제 콘텐츠의 주인공 → 서체·구도·색 중 표현의 중심 → 대표 구간 제작 → 전체 확장.
- 기본 exemplar를 편집형·제품 무대형·넓은 색면형 세 가지로 교체했다. 이전 예시는 기능 회귀 재료로 남겼다.
- Look/review의 중복 체크리스트·고정 길이 보고를 줄였다. 전이·복구와 AI 상태는 실제 요청 범위에만 적용한다.
- 보편적인 accent 면적·폰트 수 할당을 제거했다. 접근성·토큰 리터럴 ≤0.1·명시적 제품 제약은 유지한다.
- Live host stdin EOF와 현재 Codex 이벤트 파싱을 수정하고 회귀 테스트를 추가했다.

## 실제 실행 결과

보존 루트 `R`: 저장소의 `.omx/fid-eval-47bghsk4/`. 자동 삭제되는 `/tmp`가 아니다.
[evidence.json](evidence.json)은 공개 가능한 경로·hash·종료 사실만 담는다. 원시 대화와 생성물은 `R`에 보존하며 배포하지 않는다.

| Codex baseline           | r1                | r2                    | 부모 renderer에서 관측한 r1               |
| ------------------------ | ----------------- | --------------------- | ----------------------------------------- |
| b03-marketing-landing-ko | exit 0, HTML 있음 | quota 실패, 부분 HTML | 4/4 캡처, 측정 게이트 통과, literal .0051 |
| b06-content-reading-en   | exit 0, HTML 있음 | quota 실패, 부분 HTML | 4/4 캡처, 측정 게이트 통과, literal .0085 |
| b07-data-table-ko        | exit 0, HTML 있음 | quota 실패, HTML 없음 | 4/4 캡처, 작은 탭 타깃 13개, literal 0    |

완료된 r1도 평가 호스트 내부에서는 브라우저 권한·오프라인 DESIGN.md linter 문제를 보고했다.
따라서 **생성 완료 3건 ≠ end-to-end 게이트 통과 3건**이다. 부모 캡처가 호스트의 미열람을 소급해서 없애지 않는다.
실패한 r2의 부분 출력은 완료로 세지 않는다. 마케팅 r2의 emoji 1개도 진단값으로만 보존했다.
Claude smoke는 exit 1 / HTML 없음 / 146,386ms이며 `seven_day` 제한과 API 429가 기록됐다.

[summary.json](summary.json)·[summary.md](summary.md)는 기존 grader의 실제 출력이다(로컬 workspace 접두사만 상대 경로화).
`AUTHORITATIVE_FULL_CORPUS`는 **선택한 3브리프·baseline 1호스트·6개 시도 레코드의 구조적 범위**만 뜻한다.
성공한 6개 생성물이나 candidate 비교를 뜻하지 않으며, 실제 pass^k는 0/3, 심판 수는 0이다.
`R/grade-input/`에는 정확한 fixture의 meta/부모 metrics만 바이트 그대로 복사했다. 중첩된 실패 `design-loop` metrics를 별도 fixture로 세던 최초 진단은 `R/summary/`에 보존했다. Run 오류는 제거하지 않았다.

## 예시의 관측과 검증 범위

2026-09-12의 실제 관측:

| 예시                    | 관측 출처                                                 | 옮긴 관계 / 직접 실행한 동작                 |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------- |
| editorial-signal-ledger | [The Guardian](https://www.theguardian.com/international) | 편집 위계·비대칭 정렬 / 주제 필터            |
| image-orbit-rail        | [Apple iPhone](https://www.apple.com/iphone/)             | 큰 제품 무대·별도 선택 레일 / 선택·이전·다음 |
| color-pathway           | [Headspace](https://www.headspace.com/)                   | 넓은 브랜드 색면·선택 구조 / 선택·reset      |

자체 콘텐츠·HTML/CSS/SVG 재구성이다. 제3자 사진·로고·코드·폰트 파일을 복사한 pixel/full-site clone이 아니다.
원본 관측은 `R/observations/`, 관계 재구성·치환 기록은 `R/candidate-examples/PROVENANCE.md`와 `evidence/`에 있다.
최종 예시마다 375/1280 × light/dark 4개 캡처와 metrics를 보존했다. 세 예시의 literal ratio는 모두 0이며 대비·overflow·작은 텍스트·탭 타깃 등 측정 게이트를 통과했다.
긴 문구를 넣은 실제 변형 HTML 3개·캡처 12개는 `R/example-review/`에 있다. 수정 중 잘못된 캡처는 별도 진단 폴더로 보존했다.
키보드 Tab/Enter/Space, 선택·복귀, 일반/축소 모션의 같은 종료 상태를 실제 브라우저로 검사했다. 종료 상태의 일치는 정상 모션의 시간축 관측이나 미감의 증명이 아니다.
`R/evidence-audit.json`에 아티팩트 123개의 SHA256·관측 범위·공백과 통합 소스 브라우저 검사 결과가 있다.

## 비교 조건과 남은 공백

- 원본 `baseline-skill/`과 60개 파일 hash를 변경 없이 보존했다. 두 arm의 생성 입력은 `briefs-v0.json`을 사용하도록 고정했다.
- `briefs-v1.json`·`gates-v1.json`은 공통 판단 기준이다. 브리프의 실제 prompt/content는 동일하며 체크리스트·게이트만 변경했다.
- 계획과 달리 baseline 6개를 완성하지 못했다. 부분 baseline 뒤, candidate 생성 전 rubric을 동결한 경위는 `R/rubric-freeze.json`에 있다.
- Candidate snapshot/hash는 보존했으나 생성하지 못했다. Codex와 Claude를 서로의 대조군으로 섞지 않았다.
- 수동 baseline 5사례의 실제 artifact 관측은 `R/manual-browser/`에 있다. 2사례는 생성 terminal 증명이 없으며, no-image 모바일 링크 3개가 44×44 미만이었다. 추가된 저장·예산 정책은 승인/검증된 것으로 보지 않는다.
- 실제 motion 사례는 HTTP로 next→back을 일반/축소 설정 각각 실행했다. `file://`의 로딩 화면은 동작 증거에서 제외했다. Candidate 수동 회귀는 미실행이다.
- 로드 비용은 원본/수정 문서 bytes만 비교할 수 있다. Candidate 실행이 없으므로 토큰·최초 렌더 시간의 절감률은 미측정이다.
- 후속 비교는 같은 호스트·설정·예산으로 생성하고 동일 rubric을 적용한다. 심판에는 variant 이름이 드러나지 않는 경로를 제공한다. 기본 심판의 light 375/1280 비교와 dark 기술 검사를 구분한다.

## 재검증

최종 실행: 브라우저 포함 **96/96 테스트 통과, 실패·skip 0**. 패키지 lint, 변경 파일 Prettier, `git diff --check` 통과. 실제 로그 hash는 `evidence.json`에 있다.

```bash
pnpm --filter @lodado/frontend-interface-design-plugin test
pnpm --filter @lodado/frontend-interface-design-plugin lint
# 기존 Playwright와 Chrome이 있으면 실제 브라우저 검사도 실행한다.
FID_PLAYWRIGHT_DIR="$PWD/packages/frontend-interface-design/clone-lab" \
FID_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
pnpm --filter @lodado/frontend-interface-design-plugin test
```

패키지에 별도 build/typecheck 스크립트는 없다. 릴리스·버전 변경·새 의존성은 추가하지 않았다.
