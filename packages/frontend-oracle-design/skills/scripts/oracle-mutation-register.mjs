// oracle-discovery.mjs의 mutation 자식 프로세스가 `node --import`로 부른다. ORACLE_MUTATION_REDIRECT의
// { 원본 URL → 변이 파일 URL } 표를 resolve 훅에 넘긴다 — 원본 트리에는 아무것도 쓰지 않고 제품 모듈 하나만 바꿔 끼운다.

import { realpathSync } from 'node:fs'
import { register } from 'node:module'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Node는 심볼릭 링크를 실제 경로로 풀어 모듈 URL을 만든다(macOS tmpdir `/var` → `/private/var`) — 링크 경로로 적은 표는 조용히 빗나간다.
const real = (url) => {
  try {
    return pathToFileURL(realpathSync(fileURLToPath(url))).href
  } catch {
    return url
  }
}
const redirect = Object.fromEntries(
  Object.entries(JSON.parse(process.env.ORACLE_MUTATION_REDIRECT ?? '{}')).map(([original, mutated]) => [
    real(original),
    real(mutated),
  ]),
)

register('./oracle-mutation-hooks.mjs', import.meta.url, { data: redirect })
