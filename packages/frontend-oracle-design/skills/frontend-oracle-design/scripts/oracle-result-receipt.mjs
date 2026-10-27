// 비싼 파생 결과를 명령 사이에 다시 쓴다 — 같은 입력·하네스·bend면 같은 결과다. lint 영수증과 같은 디렉터리·같은 신뢰 범위
// (같은 사용자의 로컬 캐시이지 보안 경계가 아니다)이고 ORACLE_LINT_CACHE=off면 쓰지도 읽지도 않는다.
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { isDeepStrictEqual } from 'node:util'
import { reportedVersion } from './ensure-bend.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import { harnessDigest, readReceipt, receiptDirectory, writeReceipt } from './oracle-lock.mjs'

const KEPT_PER_KIND = 30

/**
 * `compute()`의 결과를 `kind`·`bin`·`inputs`가 같은 동안 돌려 쓴다. 결과는 JSON을 거쳐 같은 값으로 돌아올 때만 적는다 — 아니면
 * 캐시가 원본과 다른 값을 돌려줄 수 있다. 도구가 환경 때문에 못 돌아 "모름"으로 끝난 결과는 입력이 같아도 다음엔 달라질 수
 * 있으니 `cacheable(result)`가 거짓이면 적지 않는다. 캐시를 못 읽거나 못 써도 결과는 그대로다.
 */
export async function withResultReceipt({ kind, bin, inputs, cacheable = () => true }, compute) {
  const directory = receiptDirectory()
  // ORACLE_RESULT_CACHE=off는 결과 영수증만 끈다 — lint 영수증은 그대로다(실패 주입 테스트가 계산을 건너뛰지 않게)
  if (!directory || process.env.ORACLE_RESULT_CACHE === 'off') return compute()
  const key = `${kind}-${sha256(
    stableStringify({
      kind,
      harness: await harnessDigest(),
      node: process.version,
      bend: bin ? [bin, reportedVersion(bin)] : null,
      inputs,
    }),
  )}`
  const cached = await readCached({ directory, key })
  if (cached !== null) return cached
  const result = await compute()
  if (cacheable(result)) await writeCached({ directory, key }, result, kind)
  return result
}

async function readCached(receipt) {
  const text = await readReceipt(receipt)
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

async function writeCached(receipt, result, kind) {
  const text = JSON.stringify(result)
  if (text === undefined || !isDeepStrictEqual(JSON.parse(text), result)) return
  try {
    await writeReceipt(receipt, text)
    await prune(receipt.directory, kind)
  } catch {
    // 캐시를 못 쓰면 다음 명령이 다시 계산할 뿐이다 — 결과는 이미 돌려줄 수 있다
  }
}

/** 영수증 디렉터리가 결과 영수증으로 불어나지 않게 — 종류마다 가장 최근 것만 남긴다. */
async function prune(directory, kind) {
  const names = (await readdir(directory)).filter((name) => name.startsWith(`${kind}-`))
  if (names.length <= KEPT_PER_KIND) return
  const dated = await Promise.all(names.map(async (name) => ({ name, at: (await stat(join(directory, name))).mtimeMs })))
  dated.sort((left, right) => right.at - left.at)
  await Promise.all(dated.slice(KEPT_PER_KIND).map(({ name }) => rm(join(directory, name), { force: true })))
}
