import process from 'node:process'
import { BEND_VERSION, ensureBend } from './ensure-bend.mjs'

/**
 * 실제 Bend 통합 테스트용 — 고정 버전이 이미 설치됐을 때만 돈다. 테스트는 내려받지 않는다: 설치본이 없으면
 * 이유를 남기고 skip한다. skip은 통과가 아니다 — node:test 요약에 skipped로 남는다.
 * ORACLE_REQUIRE_BEND=1(CI)이면 skip하지 않고 실패한다 — 실제 커널 통합이 조용히 빠진 채 초록이 되지 않게 한다.
 */
export async function installedBend(t) {
  try {
    const { bin } = await ensureBend({
      download: () => {
        throw Object.assign(new Error('tests never download Bend'), { code: 'BEND_NOT_INSTALLED' })
      },
    })
    return bin
  } catch (error) {
    if (process.env.ORACLE_REQUIRE_BEND === '1')
      throw new Error(`ORACLE_REQUIRE_BEND=1 but Bend ${BEND_VERSION} is not installed (${error.code ?? error.message})`)
    t.skip(`Bend ${BEND_VERSION} is not installed (${error.code ?? error.message}) — real Bend integration not run`)
    return null
  }
}
