/**
 * node:test용 NDJSON reporter. Node는 JSON reporter를 내장하지 않으므로
 * `oracle-run.mjs exec --report`가 읽을 수 있는 최소 이벤트만 흘려보낸다.
 *
 * node --test --test-reporter=<이 파일> --test-reporter-destination=<경로>
 */
function statusFor(event) {
  if (event.data.skip) return 'skipped'
  if (event.data.todo) return 'todo'
  if (event.type === 'test:pass') return 'passed'
  return 'failed'
}

export default async function* oracleNodeReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    // node:test emits pass events for suites too.  A suite is not evidence.
    if (!event.data?.name || event.data?.type === 'suite' || event.data?.details?.type === 'suite') continue

    yield `${JSON.stringify({ type: event.type, data: { name: event.data.name, status: statusFor(event), test: true } })}\n`
  }
}
