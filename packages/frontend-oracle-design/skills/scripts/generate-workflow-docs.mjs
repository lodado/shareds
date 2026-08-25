import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const generatedBlockStart = '<!-- WORKFLOW_DOCS:START (generated; do not edit) -->'
export const generatedBlockEnd = '<!-- WORKFLOW_DOCS:END (generated; do not edit) -->'

const scriptDirectory = new URL('.', import.meta.url)
const defaultGraphPath = fileURLToPath(new URL('../references/oracle-workflow.graph.json', scriptDirectory))
const defaultReadmePath = fileURLToPath(new URL('../README.md', scriptDirectory))

function graphCounts(graph) {
  if (
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(graph.fallback) ||
    !Array.isArray(graph.terminals)
  ) {
    throw new TypeError('Workflow graph must define nodes, edges, fallback, and terminals arrays.')
  }

  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    fallbacks: graph.fallback.length,
    terminals: graph.terminals.length,
  }
}

export function renderGeneratedBlock(graph) {
  const { nodes, edges, fallbacks, terminals } = graphCounts(graph)

  return `${generatedBlockStart}

## 워크플로우 그래프

공개 운영자 화면은 전체 제어 그래프를 여섯 단계로 압축합니다. 현재 canonical graph는 노드
${nodes}개, 엣지 ${edges}개, fallback ${fallbacks}개, terminal ${terminals}개입니다.

\`\`\`mermaid
flowchart LR
  DEFINE["DEFINE<br/>Oracle Card 초안"] --> LOCK["LOCK<br/>사용자 확인·lock"]
  LOCK --> PROVE["PROVE<br/>VALID_RED"]
  PROVE --> BUILD["BUILD<br/>최소 구현·GREEN"]
  BUILD --> REVIEW["REVIEW<br/>독립 검토"]
  REVIEW --> CERTIFY["CERTIFY<br/>REVIEW_VERIFIED"]

  DEFINE -. "policy decision wait" .-> POLICY["정책 결정 대기"]
  POLICY -. "승인된 정책으로 재정의" .-> DEFINE
  BUILD -. "evidence / harness repair" .-> REPAIR["증거·harness 보정"]
  REPAIR --> BUILD
  BUILD -. "failure" .-> STOP(["failure stop"])
  REVIEW -. "failure" .-> STOP
\`\`\`

- 정책 판단이 비면 **policy decision wait**로 나가며, 승인된 정책으로만 DEFINE에 돌아갑니다.
- evidence/harness 문제는 정책·production을 바꾸지 않고 보정한 뒤 BUILD로 돌아갑니다.
- 복구 불가능한 실패는 **failure stop**으로 끝납니다.

이 도식은 operator projection입니다. dispatch, 병렬 high-risk review, join, ledger receipt,
visual-pending resume, 그리고 모든 정확한 전이는
[\`oracle-workflow.graph.json\`](references/oracle-workflow.graph.json)의 canonical controller
view가 소유합니다.

${generatedBlockEnd}`
}

export function replaceGeneratedBlock(readme, generatedBlock) {
  const start = readme.indexOf(generatedBlockStart)
  const end = readme.indexOf(generatedBlockEnd)

  if (start === -1 && end === -1) {
    throw new Error('README is missing the workflow docs generated block markers.')
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error('README has malformed workflow docs generated block markers.')
  }

  return `${readme.slice(0, start)}${generatedBlock}${readme.slice(end + generatedBlockEnd.length)}`
}

export function isGeneratedBlockCurrent(readme, graph) {
  const generatedBlock = renderGeneratedBlock(graph)
  return replaceGeneratedBlock(readme, generatedBlock) === readme
}

export async function updateWorkflowDocs({
  graphPath = defaultGraphPath,
  readmePath = defaultReadmePath,
  check = false,
} = {}) {
  const [graphSource, readme] = await Promise.all([readFile(graphPath, 'utf8'), readFile(readmePath, 'utf8')])
  const generatedBlock = renderGeneratedBlock(JSON.parse(graphSource))
  const updatedReadme = replaceGeneratedBlock(readme, generatedBlock)

  if (check) {
    return updatedReadme === readme
  }

  if (updatedReadme !== readme) {
    await writeFile(readmePath, updatedReadme)
  }
  return true
}

async function main() {
  const args = new Set(process.argv.slice(2))
  if (args.size > 1 || (args.size === 1 && !args.has('--check'))) {
    throw new Error('Usage: node skills/scripts/generate-workflow-docs.mjs [--check]')
  }

  const current = await updateWorkflowDocs({ check: args.has('--check') })
  if (!current) {
    console.error('Generated workflow documentation is stale. Run workflow-docs:generate.')
    process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
