import { splitDelivery } from './generate-reference-bundles.mjs'

// These are operator summaries, not another gate or state machine. The supplied packet owns
// targets, requirements, evidence candidates and blockers; reference nodes own detailed judgment.
const INSTRUCTIONS = {
  VALID_RED: {
    objective: 'Establish a reported failure of the locked contract before production changes.',
    writeBoundary: 'tests-only',
    steps: [
      'Invoke $test immediately before authoring tests; keep the locked Then, Never and effect counts unchanged.',
      'Run the mapped test through red or exec with the trusted reporter; an infrastructure failure is not VALID_RED.',
    ],
  },
  IMPLEMENTED_GREEN: {
    objective: 'Implement only the locked behavior and verify the current bytes.',
    writeBoundary: 'locked-scope-production',
    steps: [
      'Record material responsibility assignments in implementation-decision.md before minimal production changes.',
      'Apply bounded simplification without weakening tests or changing policy; spend the existing applicable budget.',
      'Run the required labels and repeated passes, then cite current reported evidence in the transition.',
    ],
  },
  REVIEW_VERIFIED: {
    objective: 'Obtain independent review and fresh verification of the locked scope.',
    writeBoundary: 'locked-scope-corrections',
    steps: [
      'Generate review-packet; give independent reviewers the raw packet and their separately assigned references.',
      'Record reviewer receipts, classify findings and route policy changes to a new confirmed revision.',
      'Re-run GREEN and required verification after review; supply the packet, findings and applicable blind or mutation evidence.',
      'Pending visual evidence is not approval. Open holds require PARTIAL_VERIFIED rather than REVIEW_VERIFIED.',
    ],
  },
  PARTIAL_VERIFIED: {
    objective: 'Verify the locked unheld scope while explicitly preserving open holds.',
    writeBoundary: 'locked-unheld-scope-corrections',
    steps: [
      'Complete the same independent review, receipts and post-GREEN verification required for REVIEW_VERIFIED.',
      'Do not write tests or production for held rows; report the holds and resolve them only in a new confirmed revision.',
      'Pending visual evidence still blocks review completion; PARTIAL_VERIFIED does not waive review gates.',
    ],
  },
  ORACLE_READY: {
    objective: 'Resume the existing revision without treating guidance as new approval.',
    writeBoundary: 'no-production',
    steps: [
      'Confirm the locked meaning and source bytes still apply, and cite the required current run.',
      'Changed policy or sources require the existing Draft, confirmation and new-revision procedure; never relock to bypass drift.',
    ],
  },
  NEEDS_DECISION: {
    objective: 'Record the unresolved policy or changed revision and return the decision to the user.',
    writeBoundary: 'no-production',
    steps: [
      'Show the current card, relevant delta and unresolved questions; record the actual stop reason.',
      'Preserve the lock, history and evidence. A stop grants no relock, resume or implementation authority.',
    ],
  },
  FAIL: {
    objective: 'Record why judgment cannot continue without claiming success.',
    writeBoundary: 'no-production',
    steps: [
      'Record the actual environment, harness, tool or exhausted-budget failure and the last observed result.',
      'Preserve history and budgets; never reset, relock or rewrite evidence to bypass the failure.',
    ],
  },
}

function actionInstructions(currentState, to) {
  if (currentState === 'ORACLE_READY' && to === 'IMPLEMENTED_GREEN') {
    return {
      objective: 'Verify already-satisfied behavior without a production change.',
      writeBoundary: 'no-production',
      steps: [
        'Use the already-satisfied path only when the locked behavior already exists; make zero production edits.',
        'Run the required verification and provide the explicit reason with fresh reported evidence. Otherwise establish VALID_RED first.',
      ],
    }
  }
  const instruction = INSTRUCTIONS[to]
  if (currentState === 'VALID_RED' && to === 'VALID_RED') {
    return {
      ...instruction,
      steps: [
        'Spend the harness budget for the changed harness bytes, then obtain a fresh reported RED.',
        ...instruction.steps,
      ],
    }
  }
  return instruction
}

function reference(node) {
  return { id: node.id, path: node.path }
}

export function deliveryGuidance({ status, to, graph, rejection, protocol }) {
  const guide = { schemaVersion: 1, authority: 'advisory' }
  if (protocol) guide.protocol = { language: protocol.language, source: 'references/delivery.protocol.json' }
  if (status) {
    if (status.verificationProfile) {
      guide.verificationProfile = status.verificationProfile
      guide.controller = status.controller
    }
    if (status.verificationProfile) guide.verification = status.verification
    guide.currentState = status.currentState
    guide.availableTargets = status.nextLegalActions
    guide.observations = status.blockers
    if (to) {
      const packet = status.nextActions.find((action) => action.to === to)
      const { delivered } = splitDelivery(graph, { id: `guide-${to}`, ...(status.verificationProfile ? { profile: status.verificationProfile } : {}), nodes: packet.readNodes })
      guide.action = {
        ...packet,
        ...(protocol ? { contract: protocol.targets[to] } : {}),
        instructions: actionInstructions(status.currentState, to),
        reads: {
          agent: delivered.filter((node) => node.loader !== 'reviewer').map(reference),
          reviewer: delivered.filter((node) => node.loader === 'reviewer').map(reference),
        },
      }
    }
  }
  if (rejection) guide.rejection = rejection
  return guide
}

function formatReferences(nodes) {
  return nodes.map((node) => `${node.id} (${node.path})`).join(', ') || 'none'
}

export function renderGuidance(guide) {
  const lines = ['authority: advisory — only the existing transition gate accepts a state change; ready is not a pass']
  if (guide.protocol) lines.push(`protocol: ${guide.protocol.language} (${guide.protocol.source})`)
  if (guide.currentState) {
    lines.push(
      `state: ${guide.currentState}`,
      `available: ${guide.availableTargets.join(', ') || 'none'}`,
      `observations: ${guide.observations.join(', ') || 'none'}`,
    )
  }
  if (guide.rejection) {
    lines.push(`rejection: ${guide.rejection.code} (caller-supplied, not an observed event)`)
    if (guide.rejection.next) lines.push(`next: ${guide.rejection.next}`)
  }
  if (guide.action) {
    const action = guide.action
    lines.push(
      `action: ${action.to}`,
      `objective: ${action.instructions.objective}`,
      `writeBoundary: ${action.instructions.writeBoundary}`,
    )
    action.instructions.steps.forEach((step, index) => lines.push(`step ${index + 1}: ${step}`))
    lines.push(
      `ready: ${action.ready}`,
      `blockers: ${action.blockers.join(', ') || 'none'}`,
      `requires: ${action.requires.join(', ') || 'none'}`,
      `candidateRuns: ${action.candidateRuns.join(', ') || 'none'}`,
      `read: ${formatReferences(action.reads.agent)}`,
    )
    if (action.reads.reviewer.length > 0) lines.push(`reviewerReads: ${formatReferences(action.reads.reviewer)}`)
    lines.push(`example: ${action.example}`)
    return `${lines.join('\n')}\n`
  }
  if (guide.currentState && guide.availableTargets.length > 0) {
    lines.push('select: request guide with --to <target>; do not infer a choice from ready or list order')
  }
  return `${lines.join('\n')}\n`
}
