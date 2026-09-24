/**
 * Trusted runner registry.
 *
 * `grade: reported`의 의미는 "JSON이 파싱됐다"가 아니라 "오라클이 소유한 리포터가
 * 이 실행에서 직접 만든 결과다"이다. `exec`는 임의 명령을 spawn하므로, 명령 자신이
 * 쓸 수 있는 파일은 증거가 되지 못한다. 따라서 신뢰 등급은 아래 조건을 모두 지키는
 * 어댑터에만 준다.
 *
 *   1. 리포터 모듈을 오라클이 주입한다 (사용자 인자로 대체 불가)
 *   2. 출력 목적지를 오라클이 소유한다 (`.runner-reports/<runId>`에 배타 생성)
 *   3. 사용자가 리포터·목적지 인자를 직접 넘기면 거부한다
 *   4. 선언한 어댑터와 실제 명령이 일치하는지 검사한다
 *
 * 새 러너 추가는 이 표에 항목 하나를 더하는 것으로 끝난다. 판정 로직(oracle-run,
 * oracle-verify)은 항목 내용을 알지 못하고 `isTrustedAdapter`만 본다.
 *
 * 주의: 이 표는 리포터 모듈을 오라클이 작성할 수 있는 런타임(JS)에만 적용된다.
 * 다른 언어 러너는 `exit-only`로 남는다 — 축소가 아니라 정직한 표시다.
 */

const FORBIDDEN_SHARED = ['--eval', '-e']

/**
 * 판정을 느슨하게 하는 러너 옵션 — 재시도는 경합을 숨기고, 기준선 갱신은 기대값을 현재 동작으로 바꾸고, 처리 안 된
 * 오류 무시·빈 실행 통과·실패만 재실행은 실패를 통과로 읽게 하고, `.only` 허용·제외는 매핑된 테스트를 빼게 한다.
 * 설정 파일 쪽은 init이 harness로 얼린다.
 */
const LENIENCY_FLAGS = {
  'node-test': ['--test-update-snapshots', '--test-rerun-failures'],
  vitest: ['--retry', '--update', '-u', '--passWithNoTests', '--dangerouslyIgnoreUnhandledErrors', '--allowOnly', '--exclude'],
}

/**
 * 코드를 테스트 실행에 끼워 넣는 옵션 — 값이 등록된 harness 파일일 때만 허용한다. 아니면 VALID_RED 뒤에 만든 preload나
 * 새 설정 파일이 얼린 harness를 우회해 전역 mock·느슨한 설정을 들여온다.
 */
const INJECTION_FLAGS = {
  'node-test': ['--import', '--require', '-r', '--loader', '--experimental-loader'],
  vitest: ['-c', '--config', '--setupFiles', '--globalSetup'],
}

/** `--pass-with-no-tests`·`--retry.count=2`도 cac가 camelCase·점 경로로 푸는 같은 옵션이다. */
function optionName(argument) {
  if (!argument.startsWith('--')) return argument
  const name = argument.split('=')[0].split('.')[0]
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/^-([a-z])/, '--$1')
}

function hasArgument(command, names) {
  const wanted = new Set(names.map(optionName))
  return command.some((argument) => wanted.has(optionName(argument)))
}

export const TRUSTED_ADAPTERS = {
  'node-test': {
    reporter: 'oracle-node-reporter.mjs',
    extension: 'ndjson',
    // node:test는 리포터 목적지를 CLI로 받는다.
    forbidden: [...FORBIDDEN_SHARED, '--test-reporter', '--test-reporter-destination', ...LENIENCY_FLAGS['node-test']],
    matches: (command, { execPath }) => command[0] === execPath && command.includes('--test'),
    expectation: 'node-test adapter requires node --test',
    build: (command, { reporter, destination }) => {
      const index = command.indexOf('--test')

      return {
        command: [
          ...command.slice(0, index + 1),
          `--test-reporter=${reporter}`,
          `--test-reporter-destination=${destination}`,
          ...command.slice(index + 1),
        ],
        env: null,
      }
    },
  },
  vitest: {
    reporter: 'oracle-vitest-reporter.mjs',
    extension: 'ndjson',
    // vitest는 custom reporter에 목적지를 넘기는 CLI 옵션이 없다. 오라클이 env로
    // 지정하고 리포터가 그 경로에만 쓴다.
    forbidden: [...FORBIDDEN_SHARED, '--reporter', '--outputFile', ...LENIENCY_FLAGS.vitest],
    // `vitest`가 명령 어딘가에 있어야 하고(pnpm/npx 래퍼 허용), watch 모드를 막기
    // 위해 `run` 하위 명령을 요구한다. watch 모드는 종료하지 않아 판정이 불가능하다.
    matches: (command) =>
      command.some((argument) => argument === 'vitest' || /[/\\]vitest(?:\.[cm]?js)?$/.test(argument)) &&
      command.includes('run'),
    expectation: 'vitest adapter requires a `vitest run` command (watch mode cannot be judged)',
    build: (command, { reporter, destination }) => ({
      command: [...command, `--reporter=${reporter}`],
      env: { ORACLE_REPORT_DESTINATION: destination },
    }),
  },
}

export const TRUSTED_ADAPTER_NAMES = Object.keys(TRUSTED_ADAPTERS)

export function isTrustedAdapter(name) {
  return typeof name === 'string' && Object.hasOwn(TRUSTED_ADAPTERS, name)
}

export function trustedAdapter(name) {
  return isTrustedAdapter(name) ? TRUSTED_ADAPTERS[name] : null
}

export function forbiddenArgument(adapter, command) {
  return hasArgument(command, adapter.forbidden)
}

/** 주입 옵션의 값 목록 — `--import x`, `--import=x`, `-r x` 모두. 판정(등록 여부)은 호출자가 한다. */
export function injectedPaths(adapterName, command) {
  const names = new Set((INJECTION_FLAGS[adapterName] ?? []).map(optionName))
  const values = []
  command.forEach((argument, index) => {
    if (!names.has(optionName(argument))) return
    const inline = argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : null
    values.push(inline ?? command[index + 1] ?? '')
  })
  return values
}
