# Reference rebuild — 관측한 UI의 재현

실제 URL·기존 화면·제공된 시각 자료의 충실한 재현을 요청했을 때 Fidelity와 함께 읽는다.
새 디자인 방향을 만들거나 관측 자료를 제품 정책으로 승격하는 절차가 아니다.

## 진입과 우선순위

| 입력                             | 경로와 한계                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| 사용자 소유 URL·기존 화면의 재현 | Fidelity + 이 문서. 호스트 계약과 관측 상태를 먼저 조사한다.                       |
| 제3자 URL의 재현                 | Fidelity + 이 문서. 관측 가능한 표현만 참고하고 자산 사용 권한은 별도로 확인한다.  |
| 스크린샷만 제공                  | Fidelity + 이 문서의 정적 증거 기록. 보이지 않는 동작·반응형·모션은 unsupported다. |
| 브랜드 이름만 제공               | 기존 Reference-informed / reference-pack 경로. 이 절차로 관측을 대신하지 않는다.   |
| 레퍼런스 없음                    | 기존 Adaptation 경로. 재현이라고 주장하지 않는다.                                  |

소유 소스와 잠긴 DESIGN.md가 있는 부분은 계속 우선한다. 제3자 관측이 이를 덮어쓰지
않는다. 충돌은 명시하고, 계약이나 승인 소스 변경이 필요하면 결정 전 구현하지 않는다.
안전·권한·접근성 하한과 호스트의 API·도메인·내비게이션 계약을 보존한다.
관측한 motion의 속성·duration·easing은 일반 craft의 ≤200ms 기본값보다 우선하되,
성능·접근성 때문에 달리 구현하면 adapted로 기록한다. reduced-motion에서는 사용할 수
있는 정적 상태나 감소된 전환을 제공한다.

## 구현 전 증거 패킷

기존 컴포넌트·토큰·상태 소유자·자산·테스트 도구를 확인하고, 요청 표면 안에서만
초기/정착, scroll, hover, focus, click, 열기/닫기, 역방향, 지원 viewport를 관측한다.
접근 불가능한 상태를 관습으로 채우지 않는다. live 환경에서 제출·삭제·결제 같은
부작용을 일으키지 말고 안전한 fixture나 사용자 제공 기록을 사용한다.

기존 작업 산출물 위치에 아래 다섯 항목을 남긴다. 비어 있으면 이유를 쓴다.

1. **Evidence log**: 항목 ID와 `surface/state`, `trigger`, `observation`, `confidence`,
   `provenance`, `classification`, `open question`. provenance는 URL·관측 시각·viewport와
   캡처/기록 위치 또는 호스트 계약의 file:line을 가리킨다. confidence는 직접 관측,
   추론, 미해결을 구분한다. 추론을 직접 관측이라고 표시하지 않는다.
2. **State matrix**: 증거 ID → viewport·시작 상태·trigger·결과·중간 진행·역방향/취소·
   reduced-motion·실제 확인 결과. 해당하지 않거나 확인 불가능한 칸은 이유를 남긴다.
3. **Asset provenance**: 자산별 출처·허가/라이선스 근거·변형·배치 경로·권리 상태
   (`cleared`, `unresolved`, `replaced`). 공개 URL이라는 이유로 재사용을 허용하지 않는다.
4. **Unsupported items**: 미관측 상태, 없는 데이터·자산, 증거 부족과 정적/미지원 fallback.
5. **Contract handoff**: 보존할 API·도메인·내비게이션·접근성 계약, 기존 primitive,
   대상 파일, 검증 명령과 구현 범위.

`classification`은 직접 관측한 `observed`, 호스트에 맞춰 변경한 `adapted`, 확인할 수
없는 `unsupported`로 나눈다. fidelity.md의 누락 state·반응형·접근성 보완은 adapted로
기록하며 근거를 연결한다. 필수 상태를 생략하지도, 레퍼런스에서 확인했다고 주장하지도
않는다. 새로운 제품 정책이 필요한 보완은 `frontend-oracle-design`의 결정 경계로 보낸다.

공개 JS·CSS는 표현과 동작을 이해하는 증거이지 런타임 전체를 복사하는 입력이 아니다.
권리 미확인 자산은 **evidence-only**로 두고 배포 public/runtime 입력에 포함하지 않는다.
권리를 확인하거나 허용된 대체물로 교체하기 전 해당 자산의 출시는 차단한다. 대체할 수
없으면 명시적 미지원 상태를 남긴다. 원본처럼 보이는 가짜 데이터·미디어를 만들지 않는다.

## 구현과 검증 인계

기존 primitive로 증거 ID에 대응하는 최소 변경만 구현한다. behavior tests는 `test`,
제품 정책은 `frontend-oracle-design`의 책임을 유지한다. 증거 수집·구현·독립 리뷰의
담당자를 구분하고 구현자가 최종 통합을 맡는다. 독립 리뷰 담당자는 증거와 실행 결과를
대조해 findings를 반환하며 제품 코드나 범위를 임의로 바꾸지 않는다.

자기 확인에서는 같은 trigger로 시작·의미 있는 중간·끝과 취소/역방향, 키보드, 지원
viewport, reduced-motion을 확인한다. 정적 스크린샷은 동작 검증 증거를 대신하지 않는다.
`frontend-visual-qa`는 명시적으로 승인된 경우에만 증거 패킷·변경 파일·실행 결과를
인계한다. 인계 자체가 QA 실행이나 baseline 승인은 아니며 새 검증 runner를 만들지 않는다.

리뷰 finding은 증거 ID·구현 위치·영향·권장 수정과 observed/adapted/unsupported 또는
근거 없는 `invented`를 기록한다. 독립 리뷰가 없으면 자기 확인으로 표시한다. 도구나
자료가 없으면 미검증 항목을 `pending`으로 보고하고 독립 검증 완료를 주장하지 않는다.
이 절차의 리뷰 결과는 `VISUAL_VERIFIED`·`BROWSER_VERIFIED`를 발급하지 않는다.

요청 표면의 확인 가능한 상태와 저장소 검증이 끝나면 변경 파일, 실제 검증 결과,
의도한 이탈, 미지원·미검증 항목, 자산 권리 차단 여부를 보고한다. 미해결 항목 때문에
범위를 늘리거나 재현 완료로 포장하지 않는다.
