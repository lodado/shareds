// resolve 훅 — 원본 제품 모듈의 URL을 임시 디렉터리의 변이 파일로 돌린다. 변이 파일이 부르는 상대 import는 원본 위치
// 기준으로 풀어서, 변이 파일이 임시 디렉터리에 있어도 이웃 모듈을 그대로 찾는다.

let forward = {}
let back = {}

export async function initialize(data) {
  forward = data ?? {}
  back = Object.fromEntries(Object.entries(forward).map(([original, mutated]) => [mutated, original]))
}

export async function resolve(specifier, context, nextResolve) {
  const parentURL = back[context.parentURL] ?? context.parentURL
  const result = await nextResolve(specifier, { ...context, parentURL })
  const target = forward[result.url]
  return target ? { ...result, url: target, shortCircuit: true } : result
}
