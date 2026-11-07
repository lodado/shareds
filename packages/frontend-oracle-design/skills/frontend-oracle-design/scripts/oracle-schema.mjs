/**
 * oracle-schema.mjs — the Bend naming rules and the law-set rules oracle-model.mjs judges a model and its laws with.
 */

// ---- names Bend refuses (Bend 2.0.34 `--check-only`): keywords, and the names Base already declares

const BEND_KEYWORDS = Object.freeze({
  // a type or constructor name
  types: ['Kind', 'Type', 'Data'],
  // a record field name
  fields: ['type', 'match', 'case', 'for', 'return', 'import', 'def', 'is', 'where', 'do', 'law', 'exs'],
})
// Base's types and constructors: declaring one again is `duplicate declaration`
const BEND_BASE_NAMES = Object.freeze(
  [
    'Empty Unit Bool Cmp Either Sigma Nat Maybe Result List Word U32 F32 Char String Array Image Event Map IO App',
    'False True LT EQ GT Inl Inr Tuple Zero Succ None Some Fail Done Nil Con WNil WCon Chr SNil SCon ALeaf ANode',
    'Pix Qua Key Mouse Move Look Scroll Close MTip MLeaf MNode Emit Halt',
  ]
    .join(' ')
    .split(' '),
)

/** Why Bend refuses `name` as a type (and namespace) or a record field, or null. */
export function bendNameIssue(name, as) {
  if (as === 'field') return BEND_KEYWORDS.fields.includes(name) ? `${name} is a Bend keyword` : null
  if (BEND_KEYWORDS.types.includes(name)) return `${name} is a Bend keyword`
  return BEND_BASE_NAMES.includes(name) ? `${name} is already declared by Bend's Base` : null
}

/** A Bend law name. */
export const isLawName = (name) => /^[a-z_][\w.]*$/.test(name ?? '')

/**
 * The laws together: an effect law exists (safety alone holds for a model that does nothing), a policy with effect laws
 * has a witness, every policy is a law's or listed under Not formalized. laws: [{ kind, policies: [P*] }] in table order.
 */
export function lawSetIssues(laws, { policies, notFormalized }) {
  const out = []
  const cited = new Map()
  for (const law of laws) for (const id of law.policies) cited.set(id, [...(cited.get(id) ?? []), law.kind])
  // 공허성: 안전 법칙만으로는 아무것도 하지 않는 모델·구현도 통과한다 — 요구된 효과를 법칙으로 두고, 그 효과가 init에서
  // 실제로 일어난다는 exs 법칙을 같은 정책에 요구한다.
  if (laws.length > 0 && !laws.some(({ kind }) => kind === 'effect'))
    out.push(['formal-effect-missing', 'only safety laws — a model that does nothing satisfies them; state the required effect as an effect law'])
  for (const [policy, kinds] of cited)
    if (kinds.includes('effect') && !kinds.includes('witness'))
      out.push(['formal-witness-missing', `${policy} has effect laws but no witness (exs) law showing the effect happens from init`])
  for (const id of policies)
    if (!cited.has(id) && !new RegExp(`\\b${id}\\b`).test(notFormalized ?? ''))
      out.push(['formal-policy-unlisted', `${id} is cited by no law and not listed under Not formalized`])
  return out
}
