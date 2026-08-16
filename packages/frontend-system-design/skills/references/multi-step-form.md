# 다단계 폼·퍼널 구현 가이드

**핵심 어려움**: 사용자는 단계를 화면으로 인식하지만 데이터는 마지막에 한 번 제출된다.
그 사이에 뒤로가기, 새로고침, 앱 전환이 일어난다. 상태를 어디에 두느냐 하나로 "뒤로
갔더니 다 날아갔다"가 결정되고, 인앱브라우저는 복귀 시 화면을 새로 만드는 일이 잦아서
이 위험이 데스크톱보다 크다.

> **Oracle 우선:** 이 문서는 `frontend-oracle-design`의 활성 카드 아래에서만 쓴다.
> `ORACLE_READY` 전에는 구현하지 않는다. 추천과 코드는 정책 출처가 아니다. 코드는 구현 선택지다.

## 1. 언제 읽는가

여러 화면에 걸쳐 입력을 모아 한 번에 제출하는 흐름. 가입, 인증, 신청, 설문, 주문 정보
입력.

한 화면에서 끝나는 폼이나 단계마다 저장이 확정되는 설정 화면에는 필요 없다.

## 2. 권장 구조

URL의 민감값 배제와 제출 재시도의 멱등성은 [S1][S2]를 기준으로 저장소·서버 계약과 함께 정한다.

**현재 단계를 주소로 표현한다.** 그러면 뒤로가기가 저절로 이전 단계가 되고, 새로고침
복구 지점이 생기고, 특정 단계로 보내는 링크가 가능해진다. 단계를 컴포넌트 내부
`useState`로만 두면 뒤로가기가 퍼널 전체를 벗어난다.

**입력 값은 하나의 흐름 상태로 모은다.** 단계마다 별도 저장소를 쓰면 뒤로 갔을 때
무엇이 남고 무엇이 사라지는지 예측할 수 없다.

**민감한 값은 주소에 넣지 않는다.** 개인정보·인증 코드가 주소에 있으면 링크 공유, 서버
접근 로그, referrer로 새어 나간다. 단계 이름만 주소에 두고 값은 별도 보관 수단에 둔다.

**복구가 필요하면 새로고침을 견디는 저장소를 쓴다.** 메모리에만 있는 값은 인앱브라우저
복귀 한 번에 사라진다. 어디까지 복구할지는 제품 결정이지만, 결정하지 않으면 기본값이
"전부 날아감"이 된다.

**서버 검증 실패는 원인 단계로 되돌린다.** 마지막 화면에서 "3단계 입력이 잘못됨"이라고만
알려주면 사용자는 어디를 고쳐야 할지 찾아 헤맨다.

**제출은 버튼 잠금과 중복 방지 키를 함께 쓴다.** 잠금은 UX이고, 실제 중복 생성을 막는
건 서버가 키로 걸러내는 쪽이다.

## 3. 구현

단계를 주소로. 뒤로가기가 자연히 동작한다.

```ts
// <slice>/model/useFunnelStep.ts
const STEPS = ['profile', 'verify', 'confirm'] as const
export type Step = (typeof STEPS)[number]

export function useFunnelStep() {
  const params = useSearchParams()
  const router = useRouter()
  const candidate = params.get('step')
  const step = STEPS.includes(candidate as Step) ? (candidate as Step) : STEPS[0]
  const nextStep = STEPS[STEPS.indexOf(step) + 1]

  return {
    step,
    // push여야 뒤로가기가 이전 단계로 간다. replace면 퍼널을 벗어난다.
    goNext: () => nextStep && router.push(`?step=${nextStep}`),
    goTo: (target: Step) => router.push(`?step=${target}`),
  }
}
```

흐름 상태. 값은 한곳에 모으고 주소에는 단계만 남긴다.

```ts
// <slice>/model/useFunnelDraft.ts
export function useFunnelDraft(funnelId: string) {
  const [draft, setDraft] = useState<Draft>(() => readDraft(funnelId) ?? {})

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch }
      // 새로고침·앱 복귀를 견디게 저장한다. 민감 값은 여기서 제외한다.
      writeDraft(funnelId, omitSensitive(next))
      return next
    })

  const clear = () => {
    setDraft({})
    clearDraft(funnelId)
  }

  return { draft, update, clear }
}
```

제출. 중복 방지 키를 만들고 재시도에 재사용한다.

```ts
// <slice>/model/useSubmitFunnel.ts
export function useSubmitFunnel(funnelId: string) {
  const submissionIdRef = useRef<string | null>(null)

  return useMutation({
    mutationFn: (draft: Draft) => {
      // 재시도는 새 제출이 아니다. 같은 키를 다시 보낸다.
      submissionIdRef.current ??= crypto.randomUUID()
      return submitApplication({ ...draft, submissionId: submissionIdRef.current })
    },
    onSuccess: (result) => {
      submissionIdRef.current = null
      clearDraft(funnelId)
      // 완료 화면을 이력에서 대체해 뒤로가기로 폼에 돌아가지 않게 한다.
      router.replace(`/applications/${result.id}/done`)
    },
    onError: (error) => {
      // 서버 검증 실패는 원인 단계로 되돌린다.
      if (isFieldError(error)) goTo(stepOfField(error.field))
    },
  })
}
```

제출 버튼은 진행 중 잠근다. 이건 중복 방지 키를 대체하지 않는다.

```tsx
<button type="button" disabled={submit.isPending} onClick={() => submit.mutate(draft)}>
  제출하기
</button>
```

## 4. 판단이 갈리는 지점

| 선택           | 추천안 (정책 아님)       | 다른 선택이 맞는 때                                       |
| -------------- | ------------------------ | --------------------------------------------------------- |
| 단계 표현      | 주소 질의값              | 단계 노출이 정책상 불가하면 내부 상태 + 뒤로가기 가로채기 |
| 값 보관        | 새로고침을 견디는 저장소 | 민감도가 높아 남기면 안 되면 메모리만 + 재입력 안내       |
| 임시 저장      | 로컬 저장                | 여러 기기에서 이어가야 하면 서버 임시 저장                |
| 검증 시점      | 단계 이동 시             | 실시간 피드백이 중요한 항목은 입력 중에도                 |
| 이탈 경고      | 손실이 큰 단계에만       | 전 단계에 걸면 사용자가 학습해 무시한다                   |
| 완료 후 재진입 | 완료 안내로 보냄         | 재신청이 가능한 제품이면 새 퍼널 시작                     |
| 뒤로가기       | 이전 단계로              | 결제 직전처럼 되돌아가면 안 되는 단계는 차단 안내         |

## 5. 함정

| 증상                            | 원인                            | 교정                            |
| ------------------------------- | ------------------------------- | ------------------------------- |
| 뒤로가기가 퍼널을 통째로 벗어남 | 단계를 내부 상태로만 관리       | 단계를 주소로 표현              |
| 새로고침하니 입력이 다 날아감   | 값이 메모리에만 존재            | 복구 정책에 맞는 저장소 사용    |
| 앱 복귀 후 처음 단계로 돌아감   | 인앱브라우저가 화면을 새로 생성 | 주소 + 저장소 기반 복구         |
| 인증번호가 링크에 남음          | 민감 값을 주소에 기록           | 주소에는 단계만, 값은 별도 보관 |
| 제출이 두 번 생성됨             | 버튼 잠금만 사용                | 중복 방지 키 병행               |
| 재시도가 새 신청을 만듦         | 재시도마다 새 키 생성           | 제출 1건에 키 1개 유지          |
| 어디가 틀렸는지 모름            | 마지막 화면에서 오류 뭉쳐 표시  | 원인 단계로 이동                |
| 완료 후 뒤로가면 폼이 다시 나옴 | 완료 화면이 이력에 남음         | `replace`로 이력 대체           |

## 6. 남길 검증

network 경계는 MSW handler로 세운다.

- **제출 중복**: 제출을 연타해도 요청이 **총 1회**인지 요청 횟수로 확인한다.
- **재시도 키 재사용**: 재시도가 같은 중복 방지 키를 보내는지 확인한다.
- **뒤로가기 보존**: 이전 단계로 갔다 돌아왔을 때 입력이 남는지 확인한다.
- **새로고침 복구**: 새로고침 후 의도한 단계에서 의도한 값으로 시작하는지 확인한다.
- **응답 순서 역전**: 단계 검증 응답이 뒤바뀌어 도착해도 현재 단계 결과만 반영되는지
  확인한다.
- **서버 검증 실패**: 실패가 원인 단계로 되돌리고 이유가 보이는지 확인한다.
- **민감값 노출**: 주소에 개인정보·인증값이 남지 않는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                               | 경계        | FSD 위치                 |
| ---------------------------------- | ----------- | ------------------------ |
| 단계 검증·임시 저장·제출 요청 함수 | transport   | `<slice>/api`            |
| 흐름 상태·단계 전이·제출 훅        | model       | `<slice>/model`          |
| 단계 화면·진행 표시·오류 component | view        | `<slice>/ui`             |
| 단계별 검증 규칙 순수 함수         | pure helper | `<slice>/lib`            |
| MSW handler와 단계 응답 fixture    | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.

## 8. 근거

| ID   | 등급 | 자료                                                                                                                   | 이 문서에서 지지하는 주장                                    |
| ---- | ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [S1] | 공식 | [CWE-598 — Information Exposure Through Query Strings in GET Request](https://cwe.mitre.org/data/definitions/598.html) | 개인정보·인증값을 URL query에 두지 않는다.                   |
| [S2] | 표준 | [RFC 9110 §9.2.2 — Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)                           | 제출 재시도의 중복 방지는 API 의미와 서버 계약으로 확인한다. |
