/**
 * vitest용 NDJSON reporter. `oracle-node-reporter.mjs`와 동일한 이벤트 모양을
 * 내보내므로 `oracle-run.mjs`의 파서를 그대로 재사용한다.
 *
 * 목적지는 CLI가 아니라 `ORACLE_REPORT_DESTINATION`으로 받는다. vitest는 custom
 * reporter에 출력 경로를 넘기는 옵션이 없고, 사용자 인자로 목적지를 바꿀 수 있으면
 * 신뢰 경계가 무너지기 때문이다. `oracle-run.mjs exec --adapter vitest`가 배타
 * 생성한 경로를 넣어준다.
 */
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { failureCause } from './oracle-fs.mjs'

function statusFor(task) {
  const state = task.result?.state ?? task.mode

  if (task.mode === 'skip' || state === 'skipped') return 'skipped'
  if (task.mode === 'todo' || state === 'todo') return 'todo'
  // 재시도 끝에 통과한 테스트는 경합을 숨길 수 있다 — 증거가 아니다
  if (state === 'pass') return (task.result?.retryCount ?? 0) > 0 ? 'flaky' : 'passed'

  // 미실행(state 없음)도 통과로 세지 않는다. 증거는 실제 pass만이다.
  return 'failed'
}

/**
 * 첫 오류로 실패 원인을 가른다 — vitest는 테스트·hook 타임아웃을 이름 없는 Error의 메시지로만 알린다. 던진 hook은
 * 테스트 본문의 오류와 구별되지 않아 `other`로 남는다(hook 실패 판정은 node:test에서만 된다).
 */
function causeFor(errors) {
  const [error] = errors ?? []
  if (!error) return null
  return failureCause(error.name, { timeout: /^(?:Test|Hook) timed out in \d+ms/.test(error.message ?? '') })
}

function withCause(test, errors) {
  const cause = test.status === 'failed' ? causeFor(errors) : null
  return cause ? { ...test, cause } : test
}

function flatten(tasks, ancestors = []) {
  return (tasks ?? []).flatMap((task) => {
    const titles = [...ancestors, task.name].filter(Boolean)

    if (task.type === 'suite' || Array.isArray(task.tasks)) {
      return flatten(task.tasks, titles)
    }

    return [withCause({ name: titles.join(' > '), status: statusFor(task), file: task.file?.filepath }, task.result?.errors)]
  })
}

async function emitTests(tests) {
  const destination = process.env.ORACLE_REPORT_DESTINATION

  if (!destination) {
    // 조용히 넘어가면 "테스트 없음"으로 보여 통과처럼 읽힌다. 크게 실패한다.
    throw new Error('oracle-vitest-reporter: ORACLE_REPORT_DESTINATION is not set')
  }

  const lines = tests.map(
    (test) =>
      `${JSON.stringify({
        type: test.status === 'passed' ? 'test:pass' : 'test:fail',
        data: { name: test.name, status: test.status, test: true, cause: test.cause, file: test.file },
      })}\n`,
  )

  await writeFile(destination, lines.join(''))
}

async function emit(files) {
  await emitTests(flatten(files))
}

/**
 * vitest v4의 `onTestRunEnd`는 legacy task tree가 아니라 TestModule 리포터 API를
 * 넘긴다. 같은 NDJSON 모양으로 정규화한다.
 */
function flattenModules(modules) {
  return (modules ?? []).flatMap((module) => {
    // 수집 단계에서 죽은 모듈(미구현 import 등)은 allTests()가 던진다. 조용히 넘기면
    // 리포터가 통째로 실패해 리포트 파일이 아예 생기지 않고, 판정이 불가능해진다.
    // 그 모듈 자체를 실패 한 건으로 내보내 RED 가 등급을 받을 수 있게 한다.
    let tests = []
    try {
      tests = typeof module.children?.allTests === 'function' ? [...module.children.allTests()] : []
    } catch {
      return [{ name: `${module.moduleId ?? 'unknown module'} (collection failed)`, status: 'failed' }]
    }

    if (tests.length === 0 && module.errors?.().length > 0) {
      return [{ name: `${module.moduleId ?? 'unknown module'} (collection failed)`, status: 'failed' }]
    }

    return tests.map((test) => {
      let result = null
      try {
        result = test.result?.() ?? null
      } catch {
        result = null
      }
      const state = result?.state ?? 'failed'
      let status = state === 'passed' ? 'passed' : state
      if (status === 'passed' && test.diagnostic?.()?.flaky) status = 'flaky'
      return withCause({ name: test.fullName ?? test.name, status, file: module.moduleId }, result?.errors)
    })
  })
}

function isModuleApi(entries) {
  return (entries ?? []).some((entry) => typeof entry?.children?.allTests === 'function')
}

export default class OracleVitestReporter {
  // vitest v1~v2
  async onFinished(files) {
    await emit(files)
  }

  // vitest v3+ (v4는 TestModule[])
  async onTestRunEnd(entries) {
    if (isModuleApi(entries)) {
      await emitTests(flattenModules(entries))
      return
    }
    await emit(entries)
  }
}
