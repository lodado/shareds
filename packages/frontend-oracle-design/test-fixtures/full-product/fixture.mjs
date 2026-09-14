import { generateFromDocument } from '../../skills/scripts/oracle-frames.mjs'

export const FULL_CANDIDATES = [
  'action-repeat',
  'request-lifecycle',
  'response-order',
  'owner-lifetime',
  'server-boundary',
  'data-value',
]

export const FIXTURE_CARD = `# Synthetic full-product reporter Oracle (not consumer approval)

## Outcome Brief

- Actor and context: skill maintainer auditing a deterministic pagination-shaped event trace
- Observable success: each tuple has one exact trace and independently reported case
- Non-goals: deciding a real pagination API or proving browser behavior
- Worst regression: missing, duplicated or stale evidence accepted as coverage
- Reversibility: revert the isolated fixture
- Sources: S1

## Source Registry

| ID | Kind | Jurisdiction | Standard | Location·version | Approval status |
| --- | --- | --- | --- | --- | --- |
| S1 | project-constraint | synthetic reporter fixture | maintainer test contract | fixture.mjs#v1 (test-only authority) | approved |

## User Confirmation

- Status: approved
- Source: synthetic test fixture approval; not a real consumer user confirmation

## Decided policies

- P1: Preserve exact tuple/event order and report one distinct case per tuple. (source: S1) (rows: O1)

## Behavior Contract

| ID | Policy | Given | When | Then | Never | Side effects | BVA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | P1 | query/page/history/data/pending fixture | next/previous trace; duplicate while pending; out-of-order and owner change | exact tuple and ordered trace in one reporter case | missing/duplicate/stale mapping | reporter case×1; actual network request×0 | next/previous; single/duplicate/late; fresh/prior |

- N/A: 오류, 재시도, 빈 데이터, loading, 취소 UI는 실제 서버나 브라우저를 실행하지 않는 이 구조 검수 fixture의 범위 밖이다. (source: S1)
`

export function fullProductModel() {
  const boundaries = ['next', 'previous'].map((id) => ({ id, kind: 'action', source: 'S1' }))
  return {
    dimensionSources: { navigation: 'S1', ordering: 'S1', history: 'S1' },
    dimensionKinds: { navigation: 'input', ordering: 'input', history: 'input' },
    boundaries,
    applicability: boundaries.flatMap(({ id }) => FULL_CANDIDATES.map((candidate) => ({
      boundary: id,
      candidate,
      source: 'S1',
      ...(candidate === 'data-value'
        ? { dimensionId: 'history' }
        : candidate === 'server-boundary'
          ? { reason: 'S1 fixture server has no cursor or failure response' }
          : { dimensionId: 'ordering' }),
    }))),
    constraints: [],
    sequences: {
      ordering: {
        single: ['start:{navigation}:A', 'complete:A'],
        duplicate: ['start:{navigation}:A', 'repeat:{navigation}:pending', 'complete:A'],
        late: ['start:{navigation}:A', 'owner:query-change', 'start:{navigation}:B', 'complete:B', 'complete:A'],
      },
    },
  }
}

/** Synthetic fixture only: policies here are not a pagination default. */
export function fullProductFixture(baseCard = FIXTURE_CARD, mutateModel = () => {}) {
  const model = fullProductModel()
  mutateModel(model)
  const base = `${baseCard.split('## State Model')[0]}
## Case space

- Coverage: full-product

| Family | Dimension | Choices |
| --- | --- | --- |
| Entry | navigation | next, previous |
| Order | ordering | single, duplicate, late |
| Data | history | fresh, prior |
| Value | — | excluded: fixture S1 |
| Async | — | excluded: lifecycle is in ordered events S1 |
| Environment | — | excluded: fixture S1 |
| Platform | — | excluded: fixture S1 |
| Inherited | — | excluded: first revision S1 |

\`\`\`json
${JSON.stringify(model)}
\`\`\`
`
  const generated = generateFromDocument(base)
  const records = generated.frames.map((frame) => ({
    frame: frame.id,
    tuple: frame.tuple,
    disposition: 'covered(O1)',
    scenario: {
      id: `G-${frame.id}`,
      sources: ['S1'],
      rows: ['O1'],
      given: { query: 'q=fixture&limit=10', page: 'first', history: frame.tuple?.history, data: ['row-1'], pending: [] },
      when: (model.sequences.ordering[frame.tuple?.ordering] ?? []).map((event) => event.replaceAll('{navigation}', frame.tuple?.navigation)),
      then: { requests: '0 real network requests; simulated start carries query/page', display: 'reporter result only; no browser claim', effects: 'one independently reported case', never: 'missing, duplicate or stale tuple mapping; reordered events' },
      target: 'generator/disposition/reporter boundary',
      control: 'deterministic event trace; no external server',
      barrier: 'case complete and reporter output drained',
      observe: 'exact tuple/event assertions and reporter names',
    },
  }))
  const render = (entries = records) => `${base}
## Frame dispositions

- Dimension revision: ${generated.dimensionRevision}
- Constraint revision: ${generated.constraintRevision}

| Frame | Disposition | Tuple | Scenario |
| --- | --- | --- | --- |
${entries.map((entry) => `| ${entry.frame} | ${entry.disposition} | ${JSON.stringify(entry.tuple)} | ${entry.scenario ? JSON.stringify(entry.scenario) : ''} |`).join('\n')}
`
  return { model, generated, records, render, base }
}
