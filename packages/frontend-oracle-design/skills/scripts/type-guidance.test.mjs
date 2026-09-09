import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package scripts use the trusted node-test adapter.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const packageDirectory = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const fixtureDirectory = join(packageDirectory, 'test-fixtures/typescript')
const witnessName = 'compiler-witnesses.ts'
const cases = [
  ['payload', 2322, 'RequestState'],
  ['required-undefined', 2322, 'RequestState'],
  ['registry-missing', 1360, 'RouteRegistry'],
  ['registry-extra', 2353, 'RouteRegistry'],
  ['xor-literal', 2345, 'renderLink'],
  ['xor-variable', 2345, 'renderLink'],
  ['xor-spread', 2345, 'renderLink'],
  ['xor-undefined', 2379, 'renderLink'],
  ['correlation', 2345, 'setField'],
  ['tuple-arity', 2345, 'setField'],
  ['inference-authority', 2345, 'chooseAllowed'],
  ['distribution', 2322, 'Dist'],
  ['non-distribution', 2322, 'Whole'],
  ['distributed-never', 2322, 'Dist'],
  ['never-boxing', 2322, 'IsNever'],
  ['distributive-omit', 2322, 'DistributiveOmit'],
  ['readonly', 2540, 'PreserveModifiers'],
  ['raw-brand', 2322, 'UserId'],
  ['brand-mixing', 2322, 'UserId'],
  ['unknown-before-parser', 2322, 'UserId'],
  ['callback-variance', 2322, 'Callback'],
].map(([id, code, symbol]) => ({ id, code, symbol }))

test('state-ladder documented retry capability rejects unavailable actions', async () => {
  const ladder = await readFile(join(packageDirectory, 'skills/references/types/state-ladder.md'), 'utf8')
  const contract = ladder.match(/type DetailState =\n[\s\S]*?declare function useDetail[^\n]+/)[0]
  const root = await mkdtemp(join(tmpdir(), 'state-ladder-types-'))
  try {
    const path = join(root, 'retry.ts')
    const source = `
type Detail = { title: string }
type LoadFailure = { message: string }
type DetailId = string
${contract}
const loading: DetailResult = { state: { status: 'loading' }, retry: undefined }
const ready: DetailResult = { state: { status: 'ready', detail: { title: 'ok' } }, retry: undefined }
const failed: DetailResult = { state: { status: 'failure', reason: { message: 'offline' } }, retry: () => {} }
const result = useDetail('detail-id')
if (result.retry !== undefined) result.retry()
// @ts-expect-error loading has no retry capability
loading.retry()
// @ts-expect-error ready has no retry capability
ready.retry()
// @ts-expect-error failure must expose a real retry capability
const missing: DetailResult = { state: { status: 'failure', reason: { message: 'offline' } }, retry: undefined }
`
    const options = { strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2022 }
    await writeFile(path, source)
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([path], options))
    assert.deepEqual(
      diagnostics.map((item) => item.code),
      [],
    )

    await writeFile(path, source.replaceAll('// @ts-expect-error', '// rejected misuse:'))
    const rejected = ts.getPreEmitDiagnostics(ts.createProgram([path], options))
    assert.deepEqual(rejected.map((item) => item.code).sort(), [2322, 2722, 2722])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function fail(reason, detail, diagnostics = []) {
  throw Object.assign(new Error(`${reason}: ${detail}`), { reason, diagnostics })
}

function requireCondition(condition, reason, detail) {
  if (!condition) fail(reason, detail)
}

function diagnosticData(diagnostic, root) {
  const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
  return {
    code: diagnostic.code,
    file: diagnostic.file && relative(root, diagnostic.file.fileName),
    start: diagnostic.start,
    length: diagnostic.length,
    line: position && position.line + 1,
    column: position && position.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }
}

function compileFixture(root, overlay = new Map(), checker = ts.getPreEmitDiagnostics) {
  const configPath = join(root, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) fail('infrastructure', 'unreadable tsconfig', [diagnosticData(config.error, root)])
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath)
  if (parsed.errors.length)
    fail(
      'infrastructure',
      'invalid effective config',
      parsed.errors.map((d) => diagnosticData(d, root)),
    )
  const host = ts.createCompilerHost(parsed.options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (overlay.has(file)) return ts.createSourceFile(file, overlay.get(file), languageVersion, true)
    return getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile)
  }
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    host,
  })
  return { program, parsed, diagnostics: checker(program).map((d) => diagnosticData(d, root)) }
}

function witnessSpans(source) {
  const found = [...source.matchAll(/^\/\/ @ts-expect-error witness:([\w-]+)$/gm)]
  requireCondition(
    found.length === cases.length && (source.match(/@ts-expect-error/g) ?? []).length === found.length,
    'directives',
    'missing or unregistered negative witness',
  )
  return cases.map((item) => {
    const matches = found.filter((match) => match[1] === item.id)
    requireCondition(matches.length === 1, 'directives', item.id)
    const match = matches[0]
    const start = source.indexOf('\n', match.index) + 1
    const end = source.indexOf('\n', start)
    return { ...item, directiveStart: match.index, directiveEnd: start, start, end: end < 0 ? source.length : end }
  })
}

function within(diagnostic, span) {
  return (
    diagnostic.file === witnessName &&
    diagnostic.start >= span.start &&
    diagnostic.start < span.end &&
    diagnostic.start + (diagnostic.length ?? 0) <= span.end
  )
}

// Follow actual identifiers/aliases and local type annotations to the imported declaration.
// This is fixture provenance, not proof of product policy or a general TypeScript soundness checker.
function reachesContract(program, sourceFile, span, contractFile) {
  const checker = program.getTypeChecker()
  const seen = new Set()
  function visit(node) {
    if (seen.has(node)) return false
    seen.add(node)
    if (ts.isIdentifier(node)) {
      let symbol = checker.getSymbolAtLocation(node)
      if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
      if (
        symbol?.getName() === span.symbol &&
        symbol.declarations?.some((declaration) => declaration.getSourceFile().fileName === contractFile)
      )
        return true
      for (const declaration of symbol?.declarations ?? []) {
        if (declaration.getSourceFile() === sourceFile && !ts.isImportSpecifier(declaration) && visit(declaration))
          return true
      }
    }
    return ts.forEachChild(node, visit) ?? false
  }
  function search(node) {
    if (node.getEnd() <= span.start || node.getStart(sourceFile) >= span.end) return false
    if (ts.isIdentifier(node) && visit(node)) return true
    return ts.forEachChild(node, search) ?? false
  }
  return search(sourceFile)
}

async function verifyFixture(root = fixtureDirectory, checker = ts.getPreEmitDiagnostics) {
  const runId = randomUUID()
  const baseline = compileFixture(root, new Map(), checker)
  const { parsed, program } = baseline
  const files = program.getSourceFiles().map((file) => file.fileName)
  requireCondition(
    parsed.fileNames.includes(join(root, witnessName)) &&
      files.includes(join(root, witnessName)) &&
      files.includes(join(root, 'contracts.ts')),
    'inclusion',
    'required witness/contract missing',
  )
  const options = parsed.options
  const flags = ['strict', 'strictFunctionTypes', 'exactOptionalPropertyTypes', 'noUncheckedIndexedAccess', 'noEmit']
  requireCondition(
    flags.every((flag) => options[flag] === true) &&
      options.noCheck !== true &&
      options.skipLibCheck !== true &&
      ['strictNullChecks', 'noImplicitAny'].every((flag) => options[flag] !== false),
    'config',
    'contract compiler flags weakened',
  )
  requireCondition(
    options.module === ts.ModuleKind.NodeNext &&
      options.moduleResolution === ts.ModuleResolutionKind.NodeNext &&
      options.target === ts.ScriptTarget.ES2022 &&
      options.lib?.includes('lib.es2022.d.ts') &&
      options.types?.length === 0 &&
      !options.jsx &&
      !parsed.projectReferences?.length,
    'config',
    'fixture resolution/environment changed',
  )
  const source = program.getSourceFile(join(root, witnessName)).text
  const contract = program.getSourceFile(join(root, 'contracts.ts')).text
  requireCondition(
    !/@ts-(?:ignore|nocheck)/.test(source + contract),
    'directives',
    'checking suppression is not evidence',
  )
  const spans = witnessSpans(source)
  if (baseline.diagnostics.length) fail('baseline-diagnostics', 'baseline must be GREEN', baseline.diagnostics)
  const sourceFile = program.getSourceFile(join(root, witnessName))
  for (const span of spans) {
    requireCondition(
      reachesContract(program, sourceFile, span, join(root, 'contracts.ts')),
      'binding',
      `${span.id} did not reach ${span.symbol}`,
    )
  }
  const canaryText = '\nconst __oracle_canary: string = 123\n'
  const canary = compileFixture(root, new Map([[join(root, witnessName), source + canaryText]]), checker)
  const canarySpan = { start: source.length + 1, end: source.length + canaryText.length }
  requireCondition(
    canary.diagnostics.length === 1 && canary.diagnostics[0].code === 2322 && within(canary.diagnostics[0], canarySpan),
    'canary',
    'checker did not reject the injected assignment',
  )
  const stripped = source.replace(/^\/\/ @ts-expect-error witness:[\w-]+$/gm, (line) => ' '.repeat(line.length))
  const negative = compileFixture(root, new Map([[join(root, witnessName), stripped]]), checker)
  for (const span of spans) {
    requireCondition(
      negative.diagnostics.some((d) => d.code === span.code && within(d, span)),
      'negative-origin',
      span.id,
    )
  }
  requireCondition(
    negative.diagnostics.every((d) => spans.some((span) => d.code === span.code && within(d, span))),
    'negative-origin',
    'unexpected diagnostic is not a contract rejection',
  )
  return {
    runId,
    scope: 'skill-regression-only',
    compilerPath: require.resolve('typescript'),
    compilerVersion: ts.version,
    runner: process.execPath,
    nodeVersion: process.version,
    configPath: join(root, 'tsconfig.json'),
    effectiveConfig: options,
    projectReferences: parsed.projectReferences ?? [],
    rootFiles: parsed.fileNames,
    checkedFiles: files,
    contractRevision: createHash('sha256').update(contract).digest('hex'),
    witnessRevision: createHash('sha256').update(source).digest('hex'),
    canary: canary.diagnostics[0],
    obligations: spans.map((span) => ({
      id: `fixture:${span.id}`,
      symbol: span.symbol,
      source: join(root, 'contracts.ts'),
      witness: join(root, witnessName),
      diagnostic: negative.diagnostics.find((d) => within(d, span)),
    })),
  }
}

async function isolated(action) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-type-contract-'))
  try {
    await cp(fixtureDirectory, root, { recursive: true })
    return await action(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function replaceOnce(source, before, after) {
  requireCondition(
    before !== after && source.split(before).length === 2,
    'invalid-mutation',
    'mutation must change exactly one occurrence',
  )
  return source.replace(before, after)
}

function classifyMutation(error, expected) {
  if (!error) return 'survived'
  if (error.reason === 'invalid-mutation') return 'invalid'
  if (expected(error)) return 'killed'
  if (error.reason === 'baseline-diagnostics' || error.reason === 'binding' || error.reason === 'negative-origin')
    return 'invalid'
  return 'infrastructure-failure'
}

function unusedWitness(error, id, source) {
  const span = witnessSpans(source).find((item) => item.id === id)
  return (
    error.reason === 'baseline-diagnostics' &&
    error.diagnostics.some(
      (d) => d.code === 2578 && within(d, { start: span.directiveStart, end: span.directiveEnd }),
    ) &&
    error.diagnostics.every((d) => d.code === 2578)
  )
}

function positiveDiagnostic(error, source, lineText, code, alsoUnused) {
  const start = source.indexOf(lineText)
  const span = { start, end: source.indexOf('\n', start) }
  const positive = (d) => d.code === code && within(d, span)
  const negative = witnessSpans(source).find((item) => item.id === alsoUnused)
  const permittedUnused = (d) =>
    negative && d.code === 2578 && within(d, { start: negative.directiveStart, end: negative.directiveEnd })
  return (
    start >= 0 &&
    error.reason === 'baseline-diagnostics' &&
    error.diagnostics.some(positive) &&
    error.diagnostics.every((d) => positive(d) || permittedUnused(d))
  )
}

test('uses the exact-pinned compiler, not another installed TypeScript', async () => {
  const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'))
  const compiler = JSON.parse(await readFile(require.resolve('typescript/package.json'), 'utf8'))
  assert.equal(manifest.devDependencies.typescript, '5.9.3')
  assert.equal(compiler.version, '5.9.3')
  assert.equal(ts.version, compiler.version)
})

test('checks positive consumers, imported symbols, canary and exact negative source spans', async (t) => {
  t.diagnostic(JSON.stringify(await verifyFixture()))
})

test('contract mutations fail for the intended relationship and restore GREEN', async (t) => {
  const mutations = [
    ['required-payload', 'data: T', 'data?: T', 'payload'],
    ['forbidden-property', 'onClick?: never', 'onClick?: undefined', 'xor-undefined'],
    ['correlation', '[key: K, value: T[K]]', '[key: keyof T, value: T[keyof T]]', 'correlation'],
    ['no-infer', 'value: NoInfer<T>', 'value: T', 'inference-authority'],
    ['readonly', '[K in keyof T as K]', '-readonly [K in keyof T as K]', 'readonly'],
    [
      'distribution',
      'T extends string ? T[] : never',
      '[T] extends [string] ? T[] : never',
      null,
      'const distributed:',
      2322,
      'distributed-never',
    ],
    ['distributive-omit', 'T extends unknown ? Omit<T, K> : never', 'Omit<T, K>', 'distributive-omit'],
    ['optional', '[K in keyof T as K]: T[K]', '[K in keyof T as K]-?: T[K]', null, 'const patch:', 2741],
    ['const-inference', 'defineRoutes<const T', 'defineRoutes<T', null, 'const routes:', 2322],
    [
      'exhaustiveness',
      "| { status: 'loading' }",
      "| { status: 'loading' } | { status: 'cancelled' }",
      null,
      'return assertNever(state)',
      2345,
    ],
  ]
  for (const [name, before, after, id, positive, code, alsoUnused] of mutations) {
    await isolated(async (root) => {
      const baseline = await verifyFixture(root)
      const file = join(root, 'contracts.ts')
      const original = await readFile(file, 'utf8')
      const witness = await readFile(join(root, witnessName), 'utf8')
      let error
      try {
        await writeFile(file, replaceOnce(original, before, after))
        await verifyFixture(root)
      } catch (caught) {
        error = caught
      }
      const outcome = classifyMutation(error, (failure) =>
        id ? unusedWitness(failure, id, witness) : positiveDiagnostic(failure, witness, positive, code, alsoUnused),
      )
      await writeFile(file, original)
      const restored = await verifyFixture(root)
      t.diagnostic(
        JSON.stringify({
          name,
          outcome,
          baselineRunId: baseline.runId,
          restoredRunId: restored.runId,
          diagnostics: error?.diagnostics,
          reason: error?.reason,
        }),
      )
      assert.equal(outcome, 'killed', `${name}: ${error?.message ?? 'survived'}`)
      assert.equal(restored.contractRevision, baseline.contractRevision)
    })
  }
})

test('the same verifier rejects harness bypasses without counting typos as contract kills', async (t) => {
  const mutations = [
    'omit-witness',
    'delete-witness',
    'noCheck',
    'inherited-noCheck',
    'transpile-only',
    'symbol-typo',
    'nocheck-directive',
  ]
  for (const name of mutations) {
    await isolated(async (root) => {
      const baseline = await verifyFixture(root)
      const configFile = join(root, 'tsconfig.json')
      const configText = await readFile(configFile, 'utf8')
      const witnessFile = join(root, witnessName)
      const source = await readFile(witnessFile, 'utf8')
      let checker = ts.getPreEmitDiagnostics
      if (name === 'omit-witness') {
        const config = JSON.parse(configText)
        config.files = ['./contracts.ts']
        await writeFile(configFile, JSON.stringify(config))
      }
      if (name === 'delete-witness') await rm(witnessFile)
      if (name === 'noCheck' || name === 'inherited-noCheck') {
        const config = JSON.parse(configText)
        if (name === 'noCheck') config.compilerOptions.noCheck = true
        else {
          config.extends = './base.json'
          await writeFile(join(root, 'base.json'), JSON.stringify({ compilerOptions: { noCheck: true } }))
        }
        await writeFile(configFile, JSON.stringify(config))
      }
      if (name === 'transpile-only') checker = () => []
      if (name === 'symbol-typo')
        await writeFile(
          witnessFile,
          replaceOnce(source, "chooseAllowed(allowed, 'archived')", "chooseAlllowed(allowed, 'archived')"),
        )
      if (name === 'nocheck-directive') await writeFile(witnessFile, `// @ts-nocheck\n${source}`)
      let error
      try {
        await verifyFixture(root, checker)
      } catch (caught) {
        error = caught
      }
      const reasons = {
        'omit-witness': 'inclusion',
        'delete-witness': 'inclusion',
        noCheck: 'config',
        'inherited-noCheck': 'config',
        'transpile-only': 'canary',
        'nocheck-directive': 'directives',
      }
      const outcome = classifyMutation(error, (failure) => failure.reason === reasons[name])
      await writeFile(configFile, configText)
      await writeFile(witnessFile, source)
      const restored = await verifyFixture(root)
      t.diagnostic(
        JSON.stringify({
          name,
          outcome,
          reason: error?.reason,
          baselineRunId: baseline.runId,
          restoredRunId: restored.runId,
        }),
      )
      assert.equal(outcome, name === 'symbol-typo' ? 'invalid' : 'killed', `${name}: ${error?.message}`)
    })
  }
})

test('mutation accounting does not label no-ops, unrelated errors or crashes killed', () => {
  assert.equal(
    classifyMutation(undefined, () => false),
    'survived',
  )
  assert.equal(
    classifyMutation({ reason: 'invalid-mutation' }, () => false),
    'invalid',
  )
  assert.equal(
    classifyMutation({ reason: 'baseline-diagnostics' }, () => false),
    'invalid',
  )
  assert.equal(
    classifyMutation(new Error('compiler crash or timeout'), () => false),
    'infrastructure-failure',
  )
  assert.throws(() => replaceOnce('contract', 'missing', 'replacement'), /exactly one occurrence/)
})
