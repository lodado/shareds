# 미디어 업로드 구현 가이드

**핵심 어려움**: 파일 하나하나가 독립적으로 성공하거나 실패하는데, 사용자는 그것들을
하나의 게시물로 인식한다. 여기에 취소·재시도·순서·진행률이 붙고, 모바일 사진은 회전
정보를 갖고 있어서 리사이즈하면 눕는다.

## 1. 언제 읽는가

사용자가 고른 이미지·동영상·파일을 업로드하는 UI. 여러 개를 한 번에 올리거나 진행률을
보여주거나 업로드 결과를 다른 폼과 함께 제출하는 화면.

서버가 이미 가진 미디어를 고르기만 하는 선택기에는 필요 없다.

## 2. 권장 구조

**파일별 독립 작업으로 다룬다.** 각 파일이 자기 상태·진행률·취소 수단·재시도 대상을
갖는다. 전체를 하나의 요청으로 묶으면 한 장 실패에 전부 다시 올려야 한다.

**진행률이 필요하면 `fetch`로는 안 된다.** `fetch`는 업로드 진행 이벤트를 주지 않는다.
실제 진행률을 보여주려면 `XMLHttpRequest`의 `upload.progress`를 쓰거나 진행률을 지원하는
업로드 라이브러리를 쓴다. 타이머로 가짜 진행률을 올리는 구현은 실패 시 90%에서 멈춘
채로 남아 사용자를 더 혼란스럽게 만든다.

**취소는 신호를 실제 요청까지 전달한다.** UI 상태만 바꾸는 취소는 대역폭을 계속 쓰고,
늦게 도착한 응답이 취소된 항목을 되살린다.

**클라이언트에서 리사이즈하면 회전 정보를 명시적으로 살린다.** 브라우저는 `<img>` 표시할
때 EXIF 방향을 반영하지만 canvas로 다시 그리면 그 정보가 사라져 사진이 눕는다.
`createImageBitmap(file, { imageOrientation: 'from-image' })`로 방향을 적용한 뒤 그린다.

**미리보기 URL은 반드시 해제한다.** 목록을 여닫는 화면에서 누락하면 메모리가 계속 는다.

**클라이언트 검증은 UX용이다.** 형식·용량 신뢰 판단은 서버가 다시 한다.

## 3. 구현

진행률과 취소를 함께 지원하는 업로드.

```ts
// <slice>/api/uploadWithProgress.ts
export function uploadWithProgress(
  file: File,
  { onProgress, signal }: { onProgress: (ratio: number) => void; signal?: AbortSignal },
): Promise<UploadedAsset> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const body = new FormData()
    body.append('file', file)

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    })
    request.addEventListener('load', () =>
      request.status < 400 ? resolve(JSON.parse(request.responseText)) : reject(new UploadError(request.status)),
    )
    request.addEventListener('error', () => reject(new UploadError()))
    // 취소 신호를 실제 전송까지 전달한다.
    signal?.addEventListener('abort', () => request.abort(), { once: true })

    request.open('POST', '/api/uploads')
    request.send(body)
  })
}
```

파일별 상태. 취소 컨트롤러를 항목과 함께 보관한다.

```ts
// <slice>/model/useUploadQueue.ts
type UploadItem = {
  id: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'canceled'
  progress: number
  asset?: UploadedAsset
}

const controllers = useRef(new Map<string, AbortController>())

function cancel(id: string) {
  controllers.current.get(id)?.abort()
  controllers.current.delete(id)
  update(id, { status: 'canceled', progress: 0 })
}

function onSettled(id: string, result: UploadedAsset) {
  // 취소된 항목의 늦은 응답으로 상태를 되살리지 않는다.
  if (read(id)?.status === 'canceled') return
  update(id, { status: 'done', progress: 1, asset: result })
}
```

방향을 지키는 리사이즈.

```ts
// <slice>/lib/resizeImage.ts
export async function resizeImage(file: File, maxEdge: number): Promise<Blob> {
  // from-image가 없으면 canvas에 그리는 순간 회전 정보가 사라진다.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(bitmap.width * scale, bitmap.height * scale)

  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
}
```

미리보기 해제.

```ts
// <slice>/ui/useObjectUrl.ts
export function useObjectUrl(file: File) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return url
}
```

## 4. 판단이 갈리는 지점

| 선택                | 기본 추천                        | 다른 선택이 맞는 때                              |
| ------------------- | -------------------------------- | ------------------------------------------------ |
| 부분 실패           | 성공분으로 제출 허용 + 실패 표시 | 전부 있어야 의미가 있는 묶음이면 전체 차단       |
| 동시 업로드 수      | 3개                              | 파일이 크거나 모바일 회선이 주력이면 순차        |
| 재시도              | 사용자 액션                      | 일시 오류가 잦은 환경이면 1회 자동 후 사용자에게 |
| 클라이언트 리사이즈 | 이미지면 적용                    | 원본 화질이 제품 가치면 원본 업로드              |
| 최종 순서           | 사용자 선택 순                   | 완료 순 표시가 진행 상황을 더 잘 보여주면        |
| 이탈 처리           | 경고 후 중단                     | 백그라운드 업로드를 보장할 수 있으면 계속        |
| 중복 선택           | 합쳐서 1개로                     | 같은 사진을 여러 장 쓰는 제품이면 각각           |

## 5. 함정

| 증상                              | 원인                             | 교정                                  |
| --------------------------------- | -------------------------------- | ------------------------------------- |
| 진행률이 90%에서 멈춤             | 타이머로 만든 가짜 진행률        | 실제 업로드 진행 이벤트에 연결        |
| 취소했는데 데이터가 계속 나감     | UI 상태만 변경                   | 취소 신호를 요청까지 전달             |
| 취소한 항목이 완료로 바뀜         | 늦게 온 응답을 무조건 반영       | 취소 상태면 응답 무시                 |
| 사진이 눕거나 돌아감              | canvas 재그리기로 방향 정보 유실 | `imageOrientation: 'from-image'` 적용 |
| 화면을 여닫으면 메모리가 늘어남   | 미리보기 URL 미해제              | 언마운트·제거 시 해제                 |
| 재시도하면 성공분까지 다시 올라감 | 전체 재시도                      | 실패 항목만 재시도                    |
| 큰 파일에서 브라우저가 멈춤       | 메인 스레드에서 변환             | 워커로 옮기거나 변환 생략             |
| 형식 검증을 우회한 파일이 저장됨  | 확장자만 검사                    | 서버 재검증 전제로 설계               |

## 6. 남길 검증

network 경계는 MSW handler로 세운다.

- **취소**: 취소 후 요청이 실제로 중단되고 늦은 응답이 상태를 되살리지 않는지 확인한다.
- **부분 실패**: 일부 실패 시 성공 항목과 제출 가능 여부가 의도대로인지 확인한다.
- **재시도**: 실패한 파일만 다시 올리고 성공 항목을 중복 업로드하지 않는지 요청
  **총 횟수**로 확인한다.
- **응답 순서 역전**: 나중에 시작한 파일이 먼저 끝나도 최종 순서가 의도대로인지 확인한다.
- **상한 초과**: 개수·용량 초과에서 요청이 발생하지 않고 이유가 보이는지 확인한다.
- **미리보기 해제**: 항목 제거 시 해제가 호출되는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                              | 경계        | FSD 위치                 |
| --------------------------------- | ----------- | ------------------------ |
| 업로드 요청·취소 신호 연결        | transport   | `<slice>/api`            |
| 업로드 큐·항목 상태·진행률 훅     | model       | `<slice>/model`          |
| 선택기·미리보기·진행 UI component | view        | `<slice>/ui`             |
| 검증·리사이즈·방향 보정 순수 함수 | pure helper | `<slice>/lib`            |
| MSW handler와 업로드 fixture      | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.
