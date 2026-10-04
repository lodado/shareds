import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- public CLI acceptance.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { generateFromDocument } from '../skills/frontend-oracle-design/scripts/oracle-frames.mjs'

const scripts = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
const fixtureSource = new URL('../test-fixtures/stale-search/', import.meta.url)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const loader = `data:text/javascript,${encodeURIComponent("export async function resolve(s,c,n){if(/oracle-(package|model|adequacy|projection|discovery)\\.mjs$|ensure-bend\\.mjs$/.test(s))throw Error('FORMAL_IMPORT_DENIED:'+s);return n(s,c)}")}`

const policyCard = `# Source-bound stale-search fixture, not consumer approval

## Verification Profile

- Profile: contract/v1

## Outcome Brief

- Actor and context: maintainer exercising the fixture pure search reducer
- Observable success: latest results retained through both response schedules
- Non-goals: browser, loading indicator, cancellation, retry, duplicate or unissued response
- Worst regression: old response overwrites latest results
- Reversibility: restore exact isolated reducer bytes
- Risk: Medium
- Sources: S1

## Source Registry

| ID | Kind | Jurisdiction | Standard | Location·version | Approval status |
| --- | --- | --- | --- | --- | --- |
| S1 | project-constraint | test-only stale-search fixture | explicit fixture policy | policy.md#fixture-policy | approved |

## User Confirmation

- Status: approved
- Source: explicit synthetic fixture policy only, not a consumer approval

## Decided policies

- P1: Issue advances latest id by one and preserves displayed results; stale responses are ignored; latest response replaces results. Environment delivers each response once after issue in either order. (source: S1) (rows: O1)

## Behavior Contract

| ID | Policy | Given | When | Then | Never | Side effects | BVA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | P1 | latestRequestId=0; results=null | issue old1; issue latest2; out-of-order respond in either order | newest response retained; old ignored; unresolved latest keeps prior results | stale overwrite or stale clearing | pure reducer; network×0; timers×0; state writes only return value | old-first/new-first |

- N/A: 중복, 오류, 재시도, 빈 데이터, 로딩, 취소 UI는 고정 old1/latest2 응답을 각각 한 번 전달하는 순수 reducer fixture 범위 밖이다. Browser loading, error, retry, cancellation and duplicate/unissued responses are outside fixture policy. (source: S1)

## Case space

- Coverage: full-product

| Family | Dimension | Choices |
| --- | --- | --- |
| Entry | — | excluded: fixed two issues S1 |
| Order | responseOrder | old-first, new-first |
| Data | — | excluded: fixed old1/latest2 items S1 |
| Value | — | excluded: fixed ids 1 and 2 S1 |
| Async | — | excluded: response order dimension S1 |
| Environment | — | excluded: pure reducer S1 |
| Platform | — | excluded: pure reducer S1 |
| Inherited | — | excluded: first bounded revision S1 |
`

function prepare() {
  const root = mkdtempSync(join(tmpdir(), 'contract-stale-search-'))
  const directory = join(root, '.ai/oracles/search')
  const src = join(root, 'src')
  for (const path of [directory, src, join(root, 'home'), join(root, 'bin'), join(root, 'cache'), join(root, 'node_modules')]) mkdirSync(path, { recursive: true })
  symlinkSync(process.execPath, join(root, 'bin/node'))
  for (const [name, version] of [['typescript', '5.9.3'], ['fast-check', '4.10.2'], ['type-fest', '4.41.0']]) symlinkSync(fileURLToPath(new URL(`../../../node_modules/.pnpm/${name}@${version}/node_modules/${name}`, import.meta.url)), join(root, 'node_modules', name))
  const denyNetwork = join(src, 'deny-network.cjs')
  writeFileSync(denyNetwork, "const deny=()=>{throw Error('NETWORK_DENIED')};for(const name of ['node:http','node:https']){const m=require(name);m.request=deny;m.get=deny}require('node:net').connect=deny;require('node:net').createConnection=deny;globalThis.fetch=deny\n")
  const env = { ...process.env, HOME: join(root, 'home'), PATH: join(root, 'bin'), XDG_CACHE_HOME: join(root, 'cache'), npm_config_cache: join(root, 'cache'), NODE_OPTIONS: `--require=${denyNetwork} --experimental-loader=${loader}` }
  delete env.NODE_TEST_CONTEXT
  const runtimeFiles=['oracle-stage.mjs','oracle-frames.mjs','oracle-space.mjs','oracle-profile.mjs','oracle-lock.mjs','oracle-run.mjs','oracle-verify.mjs','oracle-node-reporter.mjs','oracle-adapters.mjs']
  const runtimeSnapshot=()=>Object.fromEntries(runtimeFiles.map(path=>[path,sha(readFileSync(new URL(path,scripts)))]))
  const runtimeBefore=runtimeSnapshot()
  const commands = []
  const run = (script, ...args) => {
    const result = spawnSync(process.execPath, [new URL(script, scripts).pathname, ...args], { cwd: root, env, encoding: 'utf8' })
    commands.push({ script, entrySha256:sha(readFileSync(new URL(script,scripts))), args, exit: result.status, stdout: result.stdout, stderr: result.stderr })
    return result
  }
  const ok = result => { assert.equal(result.status, 0, result.stderr + result.stdout); return result }
  const original = readFileSync(new URL('search-reducer.mts', fixtureSource))
  const adapter = readFileSync(new URL('search.adapter.mjs', fixtureSource))
  const policy = readFileSync(new URL('README.md', fixtureSource), 'utf8').split('## Files')[0]
  writeFileSync(join(directory, 'policy.md'), policy)
  const boundaries = [{ id: 'respond', kind: 'action', source: 'S1' }]
  const model = { dimensionSources: { responseOrder: 'S1' }, dimensionKinds: { responseOrder: 'input' }, boundaries, applicability: ['action-repeat', 'request-lifecycle', 'response-order', 'owner-lifetime', 'server-boundary', 'data-value'].map(candidate => ({ boundary: 'respond', candidate, source: 'S1', ...(candidate === 'response-order' || candidate === 'request-lifecycle' ? { dimensionId: 'responseOrder' } : { reason: 'S1 fixes two issued requests and two once-delivered responses; no other boundary in this finite scope' }) })), constraints: [], sequences: { responseOrder: { 'old-first': ['start:issue:old1','start:issue:latest2','complete:old1','complete:latest2'], 'new-first': ['start:issue:old1','start:issue:latest2','complete:latest2','complete:old1'] } } }
  const base = `${policyCard}\n\`\`\`json\n${JSON.stringify(model)}\n\`\`\`\n`
  const generated = generateFromDocument(base)
  assert.equal(generated.frames.length, 2)
  // eslint-disable-next-line unicorn/no-thenable -- required JSON GWT schema key, never a Promise.
  const records = generated.frames.map(frame => ({ frame: frame.id, tuple: frame.tuple, disposition: 'covered(O1)', scenario: { id: `G-${frame.id}`, sources: ['S1'], rows: ['O1'], given: { latestRequestId: 0, results: null }, when: model.sequences.responseOrder[frame.tuple.responseOrder], then: { requests: 'two simulated issued IDs 1 and 2, zero actual network requests', display: 'results requestId 2 items latest2', pending: 'before latest response results remain null', effects: 'pure transition, no network or timers', never: 'old response changes state' }, target: 'actual reduceSearch and adapterFor', control: 'deliver each issued response once in selected order', barrier: 'both responses consumed', observe: 'complete state, object identity, retained items and adapter observation' } }))
  const oracle = join(directory, 'oracle.md')
  const dispositionRows=records.map(r => `| ${r.frame} | ${r.disposition} | ${JSON.stringify(r.tuple)} | ${JSON.stringify(r.scenario)} |`).join('\n')
  writeFileSync(oracle, `${base}\n## Frame dispositions\n\n- Dimension revision: ${generated.dimensionRevision}\n- Constraint revision: ${generated.constraintRevision}\n\n| Frame | Disposition | Tuple | Scenario |\n| --- | --- | --- | --- |\n${dispositionRows}\n`)
  const names = records.map(r => `actual reducer [${r.frame}] oracle-case:${Buffer.from(JSON.stringify({ id: r.frame, scenario: r.scenario.id, tuple: r.tuple, dimensionRevision: generated.dimensionRevision, constraintRevision: generated.constraintRevision })).toString('base64url')}`)
  writeFileSync(join(src, 'search.adapter.mjs'), adapter)
  const defect = original.toString().replace('  if (event.requestId !== state.latestRequestId) return state\n', '')
  assert.notEqual(defect, original.toString())
  writeFileSync(join(src, 'search-reducer.mts'), defect)
  const caseCalls=names.map((name,i) => `test(${JSON.stringify(name)},()=>run(${JSON.stringify(records[i].tuple.responseOrder === 'old-first' ? [1,2] : [2,1])}))`).join('\n')
  const harness = `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport {initialSearch,reduceSearch} from './search-reducer.mts'\nimport {adapterFor} from './search.adapter.mjs'\nconst run = order => {\n const a=adapterFor(reduceSearch,initialSearch);const original=JSON.stringify(initialSearch);let state=a.init();\n state=a.step(state,{$:'Issue'});assert.deepEqual(state,{latestRequestId:1,results:null});\n state=a.step(state,{$:'Issue'});assert.deepEqual(state,{latestRequestId:2,results:null});\n const issued=state;const latest=['latest2'];const old=['old1'];\n for(const id of order){const before=state;const beforeBytes=JSON.stringify(before);state=a.respond(state,id,id===2?latest:old);\n if(id===1){assert.strictEqual(state,before);assert.deepEqual(state.results,before.results)}\n else{assert.deepEqual(state,{latestRequestId:2,results:{requestId:2,items:latest}});assert.strictEqual(state.results.items,latest)}\n assert.equal(JSON.stringify(before),beforeBytes);\n }\n assert.deepEqual(state,{latestRequestId:2,results:{requestId:2,items:['latest2']}});assert.equal(a.observe(state),2);assert.equal(JSON.stringify(initialSearch),original);assert.deepEqual(issued,{latestRequestId:2,results:null});\n}\n${caseCalls}\n`
  writeFileSync(join(src, 'cases.test.mjs'), harness)
  writeFileSync(join(src, 'positive.mts'), "import type {IsEqual} from 'type-fest'\nimport {reduceSearch,initialSearch,type SearchState,type SearchEvent} from './search-reducer.mjs'\nconst equal:IsEqual<ReturnType<typeof reduceSearch>,SearchState>=true\nconst event:SearchEvent={type:'respond',requestId:2,items:['latest2']}\nconst result:SearchState=reduceSearch(initialSearch,event)\nvoid equal;void result\n")
  writeFileSync(join(src, 'negative.mts'), "import type {IsEqual} from 'type-fest'\nimport {reduceSearch} from './search-reducer.mjs'\nconst equal:IsEqual<ReturnType<typeof reduceSearch>,string>=true\nvoid equal\n")
  writeFileSync(join(src, 'property.mjs'), "import fc from 'fast-check'\nimport {initialSearch,reduceSearch} from './search-reducer.mts'\nexport const domain='two issued IDs old1/latest2, both once-delivered response permutations, generated readonly string item arrays length 0..5; sampled values distinct from exhaustive fixed-item frames'\nexport const seed=42\nexport const numRuns=30\nexport const property=fc.property(fc.boolean(),fc.array(fc.string(),{maxLength:5}),fc.array(fc.string(),{maxLength:5}),(oldFirst,oldItems,newItems)=>{let s=reduceSearch(reduceSearch(initialSearch,{type:'issue'}),{type:'issue'});for(const id of oldFirst?[1,2]:[2,1]){const before=s;s=reduceSearch(s,{type:'respond',requestId:id,items:id===1?oldItems:newItems});if(id===1&&s!==before)return false}return s.latestRequestId===2&&s.results.requestId===2&&s.results.items===newItems})\n")
  writeFileSync(join(src, 'witness.test.mjs'), "import test from 'node:test'\ntest('source compiler',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'source compiler',kind:'type-contract',positive:'positive.mts',negative:'negative.mts'})))\ntest('latest invariant',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'latest invariant',kind:'fast-check',module:'property.mjs'})))\n")
  const map = { schemaVersion: 1, rows: { O1: { kind: 'test', name: names[0] } }, frames: Object.fromEntries(records.map((r,i) => [r.frame,{ kind:'test',name:names[i],tuple:r.tuple,scenario:r.scenario.id,dimensionRevision:generated.dimensionRevision,constraintRevision:generated.constraintRevision }])), sequence: { kind:'test',name:names[0] } }
  const mapPath = join(directory, 'evidence.json')
  writeFileSync(mapPath, JSON.stringify(map))
  return { root,directory,src,original,adapter,oracle,commands,run,ok,mapPath,runtimeBefore,runtimeSnapshot }
}

test('actual stale-search Contract RED restores exact reducer then bounded GREEN with real typed/property producers', t => {
  const f = prepare()
  t.diagnostic(`RETAINED_FIXTURE ${f.root}`)
  const { run,ok,directory,src,oracle } = f
  const lock = join(directory,'oracle.lock.json')
  const frozen = ['cases.test.mjs','search.adapter.mjs','positive.mts','negative.mts','property.mjs','witness.test.mjs','deny-network.cjs']
  const snapshot = () => Object.fromEntries(frozen.map(path=>[path,sha(readFileSync(join(src,path)))]))
  const before = snapshot()
  try {
    ok(run('oracle-stage.mjs','begin','--dir',directory,'--profile','contract/v1'))
    ok(run('oracle-verify.mjs','card','--oracle',oracle,'--case-space'))
    for(const to of ['CHECKED','DRAFTED']) ok(run('oracle-stage.mjs','advance','--dir',directory,'--to',to))
    ok(run('oracle-lock.mjs','create','--oracle',oracle,'--lock',lock))
    ok(run('oracle-run.mjs','init','--dir',directory,'--lock',lock,'--scan-root',src,...frozen.flatMap(path=>['--harness-path',path]),...['contract-cases:reported','type-contract:reported','fast-check:reported'].flatMap(label=>['--required-label',label])))
    const lockedPaths=[oracle,lock,f.mapPath,join(directory,'policy.md')]
    const lockedHashes=lockedPaths.map(path=>sha(readFileSync(path)))
    writeFileSync(join(f.root,'before-red.json'),JSON.stringify({frozen:before,lockedHashes,originalReducerSha256:sha(f.original),defectiveReducerSha256:sha(readFileSync(join(src,'search-reducer.mts')))},null,2))
    const exec = (label,file,report) => ok(run('oracle-run.mjs','exec','--dir',directory,'--label',label,'--adapter','node-test','--report',join(directory,report),'--',process.execPath,'--experimental-strip-types','--test',join(src,file)))
    const ledger = () => readFileSync(join(directory,'runs.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line))
    exec('contract-cases:reported','cases.test.mjs','red.ndjson')
    assert.equal(ledger().at(-1).exitCode,1)
    ok(run('oracle-run.mjs','transition','--dir',directory,'--to','VALID_RED','--run','r-001','--evidence',f.mapPath,'--row','O1'))
    const failedProperty = run('oracle-run.mjs','exec','--dir',directory,'--label','fast-check:reported','--adapter','node-test','--report',join(directory,'property-red.ndjson'),'--',process.execPath,'--experimental-strip-types','--test',join(src,'witness.test.mjs'))
    assert.equal(failedProperty.status,1)
    assert.match(failedProperty.stderr,/REPORT_NONPASSING/)
    const failure=ledger().at(-1).tests.find(entry=>entry.contractEvidence?.kind==='fast-check')
    assert.equal(failure.contractEvidence.failed,true)
    assert.ok(failure.contractEvidence.numRuns>0)
    assert.ok(Array.isArray(failure.contractEvidence.counterexample))
    assert.equal(typeof failure.contractEvidence.counterexamplePath,'string')
    writeFileSync(join(src,'search-reducer.mts'),f.original)
    assert.deepEqual(readFileSync(join(src,'search-reducer.mts')),f.original)
    assert.deepEqual(snapshot(),before)
    let currentCase
    for(let i=0;i<2;i+=1) currentCase=exec('contract-cases:reported','cases.test.mjs',`green-${i}.ndjson`).stdout.match(/RUN_RECORDED (r-\d+)/)[1]
    for(const label of ['type-contract:reported','fast-check:reported']) exec(label,'witness.test.mjs',`${label.split(':')[0]}.ndjson`)
    ok(run('oracle-verify.mjs','evidence','--oracle',oracle,'--map',f.mapPath,'--ledger',join(directory,'runs.jsonl'),'--run',currentCase,'--phase','green'))
    ok(run('oracle-run.mjs','transition','--dir',directory,'--to','IMPLEMENTED_GREEN','--run',currentCase,'--evidence',f.mapPath))
    const status=JSON.parse(ok(run('oracle-run.mjs','status','--dir',directory,'--json')).stdout)
    assert.equal(status.currentState,'IMPLEMENTED_GREEN')
    assert.equal(status.lockStatus.status,'valid')
    assert.equal(status.ledgerStatus.status,'valid')
    assert.equal(status.ledgerStatus.headDigest,status.ledgerStatus.verifiedHeadDigest)
    assert.equal(status.evidenceStatus.status,'verified')
    const typeOutput=status.verification.obligations['type-contract'].outputs[0]
    assert.equal(typeOutput.positive.exitCode,0)
    assert.notEqual(typeOutput.negative.exitCode,0)
    assert.match(typeOutput.negative.diagnostics,/TS2322/)
    const propertyOutput=status.verification.obligations['fast-check'].outputs[0]
    assert.equal(propertyOutput.failed,false)
    assert.ok(propertyOutput.numRuns>=20)
    assert.equal(propertyOutput.seed,42)
    assert.match(propertyOutput.domain,/both once-delivered response permutations/)
    const currentRuns=ledger().filter(entry=>entry.type==='run'&&['r-003','r-004','r-005','r-006'].includes(entry.runId))
    assert.equal(currentRuns.length,4)
    for(const entry of currentRuns){
      assert.equal(entry.worktreeSha256,status.currentSnapshot.worktreeSha256)
      assert.equal(entry.productionSha256,status.currentSnapshot.productionSha256)
      assert.equal(entry.lockManifestSha256,status.currentSnapshot.lockManifestSha256)
      assert.deepEqual(entry.harnessSha256,before)
    }
    assert.deepEqual(lockedPaths.map(path=>sha(readFileSync(path))),lockedHashes)
    writeFileSync(join(f.root,'final-evidence.json'),JSON.stringify({status,ledger:ledger(),frozen:before,lockedHashes,originalReducerSha256:sha(f.original),restoredReducerSha256:sha(readFileSync(join(src,'search-reducer.mts')))},null,2))
    assert.equal(status.verification.N_executed_unique,2)
    assert.equal(status.verification.N_passed_unique,2)
    assert.equal(status.verification.formalVerification,'not-performed')
    assert.deepEqual(snapshot(),before)
    assert.deepEqual(readFileSync(join(src,'search-reducer.mts')),f.original)
    t.diagnostic(JSON.stringify({state:status.currentState,counts:[status.verification.N_executed_unique,status.verification.N_passed_unique],frozen:before,originalReducerSha256:sha(f.original),adapterSha256:sha(f.adapter),evidence:join(f.root,'final-evidence.json')}))
  } finally {
    assert.deepEqual(f.runtimeSnapshot(),f.runtimeBefore)
    writeFileSync(join(f.root,'runtime-manifest.json'),JSON.stringify(f.runtimeBefore,null,2))
    writeFileSync(join(f.root,'commands.json'),JSON.stringify(f.commands,null,2))
    t.diagnostic(`COMMANDS ${join(f.root,'commands.json')}`)
  }
})
