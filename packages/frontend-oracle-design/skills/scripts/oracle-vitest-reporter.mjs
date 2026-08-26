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

function statusFor(task) {
  const state = task.result?.state ?? task.mode

  if (task.mode === 'skip' || state === 'skipped') return 'skipped'
  if (task.mode === 'todo' || state === 'todo') return 'todo'
  if (state === 'pass') return 'passed'

  // 미실행(state 없음)도 통과로 세지 않는다. 증거는 실제 pass만이다.
  return 'failed'
}

function flatten(tasks, ancestors = []) {
  return (tasks ?? []).flatMap((task) => {
    const titles = [...ancestors, task.name].filter(Boolean)

    if (task.type === 'suite' || Array.isArray(task.tasks)) {
      return flatten(task.tasks, titles)
    }

    return [{ name: titles.join(' > '), status: statusFor(task) }]
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
        data: { name: test.name, status: test.status, test: true },
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
    const tests = typeof module.children?.allTests === 'function' ? [...module.children.allTests()] : []

    return tests.map((test) => ({
      name: test.fullName ?? test.name,
      status: test.result?.().state === 'passed' ? 'passed' : test.result?.().state ?? 'failed',
    }))
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
