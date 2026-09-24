/**
 * node:test용 NDJSON reporter. Node는 JSON reporter를 내장하지 않으므로
 * `oracle-run.mjs exec --report`가 읽을 수 있는 최소 이벤트만 흘려보낸다.
 *
 * node --test --test-reporter=<이 파일> --test-reporter-destination=<경로>
 */
import { failureCause } from './oracle-fs.mjs'

function statusFor(event) {
  if (event.data.skip) return 'skipped'
  if (event.data.todo) return 'todo'
  if (event.type === 'test:pass') return 'passed'
  return 'failed'
}

/** 실패 원인 — node는 테스트 코드의 오류를 `cause`에, 타임아웃·hook 실패를 `failureType`에 싣는다. */
function causeFor(event) {
  const error = event.data.details?.error
  if (event.type !== 'test:fail' || !error) return null
  return failureCause(error.cause?.name ?? error.name, {
    timeout: error.failureType === 'testTimeoutFailure',
    // 실패한 before/beforeEach — 자식 테스트는 hookFailed 또는 cancelledByParent로 온다
    hook: error.failureType === 'hookFailed' || error.failureType === 'cancelledByParent',
  })
}

export default async function* oracleNodeReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    // node:test emits pass events for suites too.  A suite is not evidence.
    if (!event.data?.name || event.data?.type === 'suite' || event.data?.details?.type === 'suite') continue

    // 원인이 없으면 undefined — JSON에서 키가 빠진다. file은 RED 전 기존 테스트 변경을 행에 귀속할 때 쓴다
    const data = {
      name: event.data.name,
      status: statusFor(event),
      test: true,
      cause: causeFor(event) ?? undefined,
      file: event.data.file,
    }
    yield `${JSON.stringify({ type: event.type, data })}\n`
  }
}
