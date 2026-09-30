// oracle-discovery.mjs의 mutation 자식 프로세스가 `node --import`로 부른다. ORACLE_MUTATION_REDIRECT의
// { 원본 URL → 변이 파일 URL } 표를 resolve 훅에 넘긴다 — 원본 트리에는 아무것도 쓰지 않고 제품 모듈 하나만 바꿔 끼운다.

import { register } from 'node:module'
import process from 'node:process'

register('./oracle-mutation-hooks.mjs', import.meta.url, {
  data: JSON.parse(process.env.ORACLE_MUTATION_REDIRECT ?? '{}'),
})
