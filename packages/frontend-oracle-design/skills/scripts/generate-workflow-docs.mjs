import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const generatedBlockStart = '<!-- WORKFLOW_DOCS:START (generated; do not edit) -->'
export const generatedBlockEnd = '<!-- WORKFLOW_DOCS:END (generated; do not edit) -->'
export const referenceBlockStart = '<!-- REFERENCE_DOCS:START (generated; do not edit) -->'
export const referenceBlockEnd = '<!-- REFERENCE_DOCS:END (generated; do not edit) -->'

const scriptDirectory = new URL('.', import.meta.url)
const defaultGraphPath = fileURLToPath(new URL('../references/oracle-workflow.graph.json', scriptDirectory))
const defaultReferenceGraphPath = fileURLToPath(new URL('../references/reference-graph.json', scriptDirectory))
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

function mermaidId(nodeId) {
  return nodeId.replaceAll('-', '_')
}

export function renderReferenceBlock(referenceGraph) {
  if (!Array.isArray(referenceGraph.nodes) || !Array.isArray(referenceGraph.lanes)) {
    throw new TypeError('Reference graph must define nodes and lanes arrays.')
  }

  const lowLane = referenceGraph.lanes.find((lane) => lane.exclusive)
  if (!lowLane) {
    throw new TypeError('Reference graph must declare an exclusive low-risk lane.')
  }

  const entry = referenceGraph.entry
  const laneNodes = new Set(lowLane.nodes)
  const routed = new Set([...laneNodes, entry])
  const edges = []

  for (const node of referenceGraph.nodes) {
    for (const dependency of node.requires) {
      edges.push(`  ${mermaidId(dependency)} --> ${mermaidId(node.id)}`)
      routed.add(node.id)
      routed.add(dependency)
    }
  }

  const independent = referenceGraph.nodes.filter((node) => !routed.has(node.id)).map((node) => node.id)
  const independentLine =
    independent.length > 0 ? `\n  IND["${independent.join(' · ')}<br/><i>독립 노드 — 조건 충족 시에만</i>"]` : ''

  // 라벨은 mermaid id와 파일 id가 다른 노드에만 필요하다 — lane·entry 노드는 위에서 이미 선언했다.
  const labels = referenceGraph.nodes
    .filter((node) => routed.has(node.id) && node.id !== entry && !laneNodes.has(node.id))
    .filter((node) => mermaidId(node.id) !== node.id)
    .map((node) => `  ${mermaidId(node.id)}["${node.id}"]`)

  return `${referenceBlockStart}

## Reference 로딩 그래프

계약 문서는 한 번에 다 읽지 않습니다.
[\`reference-graph.json\`](references/reference-graph.json)이 진입 risk로 lane을 고르고,
\`when\` 조건이 충족된 노드의 전문과 그 \`requires\` 엣지만 로드합니다. 아래 도식은 그
파일에서 생성되므로 노드나 \`requires\`가 바뀌면 함께 갱신됩니다.

\`\`\`mermaid
flowchart LR
  START(["요청"]) --> RISK{"risk 판정"}
  RISK -->|"${lowLane.when}"| ${mermaidId(lowLane.nodes[0])}["${lowLane.nodes[0]}<br/><i>exclusive · 이 노드만</i>"]
  ${mermaidId(lowLane.nodes[0])} -.->|"${lowLane.escalation}"| ${mermaidId(entry)}
  RISK -->|"그 외"| ${mermaidId(entry)}["${entry}"]

${labels.join('\n')}

${edges.join('\n')}${independentLine}
\`\`\`

화살표는 실행 순서가 아니라 **선행 조건**입니다. \`card-format\`을 읽으려면 \`common\`과
\`bva\`를 이미 읽었어야 한다는 뜻입니다.

${referenceBlockEnd}`
}

function replaceBlock(readme, block, startMarker, endMarker, label) {
  const start = readme.indexOf(startMarker)
  const end = readme.indexOf(endMarker)

  if (start === -1 && end === -1) {
    throw new Error(`README is missing the ${label} generated block markers.`)
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README has malformed ${label} generated block markers.`)
  }

  return `${readme.slice(0, start)}${block}${readme.slice(end + endMarker.length)}`
}

export function replaceGeneratedBlock(readme, generatedBlock) {
  return replaceBlock(readme, generatedBlock, generatedBlockStart, generatedBlockEnd, 'workflow docs')
}

export function replaceReferenceBlock(readme, referenceBlock) {
  return replaceBlock(readme, referenceBlock, referenceBlockStart, referenceBlockEnd, 'reference docs')
}

export function isGeneratedBlockCurrent(readme, graph) {
  const generatedBlock = renderGeneratedBlock(graph)
  return replaceGeneratedBlock(readme, generatedBlock) === readme
}

export async function updateWorkflowDocs({
  graphPath = defaultGraphPath,
  referenceGraphPath = defaultReferenceGraphPath,
  readmePath = defaultReadmePath,
  check = false,
} = {}) {
  const [graphSource, referenceGraphSource, readme] = await Promise.all([
    readFile(graphPath, 'utf8'),
    readFile(referenceGraphPath, 'utf8'),
    readFile(readmePath, 'utf8'),
  ])
  const withWorkflow = replaceGeneratedBlock(readme, renderGeneratedBlock(JSON.parse(graphSource)))
  const updatedReadme = replaceReferenceBlock(withWorkflow, renderReferenceBlock(JSON.parse(referenceGraphSource)))

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
