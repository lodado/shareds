import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * 스크립트가 직접 실행됐을 때만 main을 돌리고, 실패를 `CODE: message`와 exit code로 바꾼다. 모듈 자신의 CliError는
 * 그 코드·exit code를 그대로 쓰고, 다른 오류는 그 오류의 code(없으면 fallback)와 exit 1이다. 호출하는 모듈은 이것을
 * await하지 않는다 — 실패를 여기서 모두 처리하므로 promise가 거부되지 않고, top-level await는 순환 import를 교착시킨다.
 */
export async function runCli(meta, main, { CliError, fallback }) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(meta.url)) return
  try {
    await main()
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError(error.code ?? fallback, error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
