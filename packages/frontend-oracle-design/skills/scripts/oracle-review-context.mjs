import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { snapshotRegularFile } from './oracle-fs.mjs'

export const REVIEW_DIMENSIONS = Object.freeze(['readability', 'maintainability', 'reliability', 'performance'])
const SOURCES = ['approved-policy', 'implementation-reference', 'observation']
const RELATIONS = ['imports', 'calls', 'consumes', 'owns-state', 'renders', 'handles-error']
const text = (value) => typeof value === 'string' && value.trim().length > 0
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value) => Array.isArray(value) && value.every(text) && new Set(value).size === value.length
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const path = (value) => text(value) && !value.includes('\\') && !value.includes(':') && !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')
const sameSet = (left, right) => strings(left) && strings(right) && left.length === right.length && left.every((item) => right.includes(item))

function unknown(value, allowed, label, errors) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${label}.${key} is unknown`)
}

// Read the existing registry headings; registration is not approval and code is never policy.
function approvedPolicies(oracle) {
  const policies = new Map()
  let active = false
  let headers = []
  let fence = null
  for (const line of oracle.split('\n')) {
    const marker = line.trimStart().match(/^(`{3,}|~{3,})/)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (fence) continue
    if (line.startsWith('## ')) active = line.trim() === '## Source Registry'
    if (!active || !line.trim().startsWith('|')) continue
    const cells = []
    let cell = ''
    let escaped = false
    for (const character of line.trim().slice(1, -1)) {
      if (character === '|' && !escaped) { cells.push(cell.trim()); cell = '' }
      else cell += character
      escaped = character === '\\' && !escaped
    }
    cells.push(cell.trim())
    if (cells[0] === 'ID') { headers = cells; continue }
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
    if (!/^S\d+$/.test(row.ID ?? '') || !['product-policy', 'project-constraint', 'mandatory-constraint'].includes(row.Kind)) continue
    const approval = row['Approval status'] ?? row['승인 상태'] ?? ''
    const jurisdiction = row.Jurisdiction ?? row['관할']
    const location = row['Location·version'] ?? row['위치·version']
    if (/^(?:approved|승인됨)$/i.test(approval) && text(jurisdiction) && location?.startsWith('repo:')) {
      policies.set(row.ID, { path: location.slice(5).split('#')[0], jurisdiction })
    }
  }
  return policies
}

export function validateContextReview(review, { contextRefs, reviewPointRefs, selections } = {}) {
  if (!Array.isArray(review)) return ['contextReview must be an array']
  const errors = []
  const seen = new Set()
  for (const [index, entry] of review.entries()) {
    const label = `contextReview[${index}]`
    if (!object(entry)) { errors.push(`${label} must be an object`); continue }
    unknown(entry, ['dimension', 'applicability', 'reason', 'contextRefs', 'reviewPointRefs', 'missingContext'], label, errors)
    if (!REVIEW_DIMENSIONS.includes(entry.dimension) || seen.has(entry.dimension)) errors.push(`${label}.dimension must occur exactly once`)
    seen.add(entry.dimension)
    if (!['applicable', 'not-applicable', 'unresolved'].includes(entry.applicability)) errors.push(`${label}.applicability is invalid`)
    if (!text(entry.reason)) errors.push(`${label}.reason is required`)
    for (const field of ['contextRefs', 'reviewPointRefs', 'missingContext']) if (!strings(entry[field])) errors.push(`${label}.${field} must be distinct nonempty strings`)
    if (entry.applicability === 'applicable' && (!entry.contextRefs?.length || !entry.reviewPointRefs?.length)) errors.push(`${label} applicable dimension needs original context and criteria`)
    if (entry.applicability === 'unresolved' && !entry.missingContext?.length) errors.push(`${label} unresolved dimension needs missingContext`)
    if (contextRefs && Array.isArray(entry.contextRefs) && entry.contextRefs.some((ref) => !contextRefs.has(ref))) errors.push(`${label}.contextRefs is unknown`)
    if (reviewPointRefs && Array.isArray(entry.reviewPointRefs) && entry.reviewPointRefs.some((ref) => !reviewPointRefs.has(ref))) errors.push(`${label}.reviewPointRefs is unknown`)
    const selected = selections?.find(({ dimension }) => dimension === entry.dimension)
    if (selections && (!selected || selected.applicability !== entry.applicability || !sameSet(selected.contextRefs, entry.contextRefs) || !sameSet(selected.reviewPointRefs, entry.reviewPointRefs) || !sameSet(selected.missingContext, entry.missingContext))) errors.push(`${label} must cover the same packet selection`)
  }
  for (const dimension of REVIEW_DIMENSIONS) if (!seen.has(dimension)) errors.push(`contextReview missing ${dimension}`)
  return errors
}

export function validateContextManifest(manifest, { reviewPointRefs } = {}) {
  if (!object(manifest)) return ['manifest must be an object']
  const errors = []
  unknown(manifest, ['schemaVersion', 'files', 'edges', 'selections', 'budget'], 'manifest', errors)
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) errors.push('files must be a nonempty array')
  const files = Array.isArray(manifest.files) ? manifest.files : []
  const paths = new Set()
  for (const [index, file] of files.entries()) {
    const label = `files[${index}]`
    if (!object(file)) { errors.push(`${label} must be an object`); continue }
    unknown(file, ['path', 'sha256', 'sourceKind', 'reason', 'dimensions', 'ranges', 'sourceId'], label, errors)
    if (!path(file.path) || paths.has(file.path)) errors.push(`${label}.path must be a distinct repository-relative file`)
    paths.add(file.path)
    if (file.sha256 !== undefined && !digest(file.sha256)) errors.push(`${label}.sha256 is invalid`)
    if (!SOURCES.includes(file.sourceKind) || !text(file.reason)) errors.push(`${label} needs sourceKind and reason`)
    if (!strings(file.dimensions) || !file.dimensions.length || file.dimensions.some((dimension) => !REVIEW_DIMENSIONS.includes(dimension))) errors.push(`${label}.dimensions is invalid`)
    if (file.sourceKind === 'approved-policy' && !/^S\d+$/.test(file.sourceId ?? '')) errors.push(`${label}.sourceId is required`)
    if (file.ranges !== undefined && (!Array.isArray(file.ranges) || file.ranges.some((range) => !object(range) || Object.keys(range).some((key) => !['startLine', 'endLine'].includes(key)) || !Number.isInteger(range.startLine) || !Number.isInteger(range.endLine) || range.startLine < 1 || range.endLine < range.startLine))) errors.push(`${label}.ranges is invalid`)
  }
  const selections = validateContextReview(manifest.selections, { contextRefs: paths, reviewPointRefs })
  errors.push(...selections)
  if (!Array.isArray(manifest.edges)) errors.push('edges must be an array')
  for (const [index, edge] of (Array.isArray(manifest.edges) ? manifest.edges : []).entries()) {
    const label = `edges[${index}]`
    if (!object(edge)) { errors.push(`${label} must be an object`); continue }
    unknown(edge, ['from', 'to', 'relation', 'basis', 'evidenceRefs', 'unresolvedReason'], label, errors)
    for (const endpoint of [edge.from, edge.to]) {
      if (!object(endpoint) || Object.keys(endpoint).some((key) => !['path', 'symbol'].includes(key)) || !paths.has(endpoint.path) || (endpoint.symbol !== undefined && !text(endpoint.symbol))) errors.push(`${label} endpoints must name selected originals`)
    }
    if (!RELATIONS.includes(edge.relation) || !['observed', 'inferred'].includes(edge.basis)) errors.push(`${label} relation/basis invalid`)
    if (!strings(edge.evidenceRefs) || !edge.evidenceRefs.length || edge.evidenceRefs.some((ref) => ![...paths].some((file) => ref.startsWith(`${file}:`) && /^\d+(?:-\d+)?$/.test(ref.slice(file.length + 1))))) errors.push(`${label}.evidenceRefs must locate selected original file lines`)
    if (edge.basis === 'inferred' && !text(edge.unresolvedReason)) errors.push(`${label}.unresolvedReason is required for inference`)
  }
  const budget = manifest.budget
  if (!object(budget)) errors.push('budget is required')
  else {
    unknown(budget, ['maxFiles', 'maxEdges', 'exhausted'], 'budget', errors)
    if (!Number.isInteger(budget.maxFiles) || budget.maxFiles < 1 || !Number.isInteger(budget.maxEdges) || budget.maxEdges < 0 || typeof budget.exhausted !== 'boolean') errors.push('budget needs integer file/edge limits and exhausted boolean')
    if (files.length > budget.maxFiles || (manifest.edges?.length ?? 0) > budget.maxEdges) errors.push('selected context exceeds declared budget')
  }
  return errors
}

export async function snapshotContext(manifest, { root, oracle, lock, lockDirectory, reviewPoints }) {
  const errors = validateContextManifest(manifest, { reviewPointRefs: new Set(reviewPoints.map(({ path: file }) => file)) })
  if (errors.length) throw new Error(errors.join('; '))
  root = await realpath(root)
  lockDirectory = await realpath(lockDirectory)
  const policies = approvedPolicies(oracle)
  const snapshots = []
  const files = []
  for (const file of manifest.files) {
    const snapshot = await snapshotRegularFile(resolve(root, file.path), { base: root, label: `context file ${file.path}`, allowHardlinks: false })
    snapshots.push(snapshot)
    if (file.sha256 !== undefined && file.sha256 !== snapshot.sha256) throw new Error(`${file.path} supplied digest does not match`)
    if (file.ranges?.some(({ endLine }) => endLine > snapshot.bytes.toString('utf8').split('\n').length)) throw new Error(`${file.path} range exceeds original file`)
    if (file.sourceKind === 'approved-policy') {
      const source = policies.get(file.sourceId)
      const locked = lock.sources.find((entry) => resolve(lockDirectory, entry.path) === snapshot.realPath)
      if (!source || !path(source.path) || resolve(root, source.path) !== snapshot.realPath || locked?.sha256 !== snapshot.sha256) throw new Error(`${file.path} sourceId must match approved registry location/jurisdiction and locked bytes`)
    }
    files.push({ ...file, sha256: snapshot.sha256 })
  }
  for (const edge of manifest.edges) {
    for (const ref of edge.evidenceRefs) {
      const [file, range] = ref.split(':')
      const [start, end = start] = range.split('-').map(Number)
      const original = snapshots[manifest.files.findIndex((entry) => entry.path === file)]
      const lineCount = original.bytes.toString('utf8').split('\n').length
      if (start < 1 || end < start || end > lineCount) throw new Error(`${ref} is outside original line bounds`)
    }
  }
  return { context: { ...manifest, files }, snapshots }
}

export function contextGaps(context) {
  return context.budget.exhausted || context.selections.some((selection) => selection.applicability === 'unresolved' || selection.missingContext.length > 0)
}
