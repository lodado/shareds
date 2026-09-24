import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import fsd, { fsdBoundaries } from './fsd.mjs'
import base from './index.mjs'
import strictProfile, { verifyStrictProject } from './strict.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shareds-strict-consumer-'))
const write = (file, text) => {
  const target = path.join(cwd, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
}
const policy = {
  cwd,
  tsconfig: path.join(cwd, 'tsconfig.json'),
  roots: [{ path: 'src' }],
  rendering: ['src/features/users/ui/**/*.{ts,tsx}'],
  viewHooks: ['src/features/users/ui/useFocus.ts'],
  server: ['src/app/api/**', 'src/app/page.tsx'],
  reasons: { viewHooks: 'DOM-only focus lifecycle', server: 'Next RSC and route execution owners' },
}
const initial = {
  'src/features/users/model/Hidden.tsx': 'export const description: string = \"Not a view implementation\"\n',
  'src/features/users/index.ts': "export { Panel } from './ui/Panel'\n",
  'src/features/users/ui/Panel.tsx': "import { useUsers } from '../model/useUsers'\nexport function Panel(): null { useUsers(); return null }\n",
  'src/features/users/model/useUsers.ts': "import { useState } from 'react'\nimport { useRemote } from './useRemote'\nexport function useUsers(): number { const [count] = useState(0); return useRemote() ?? count }\n",
  'src/features/users/model/useRemote.ts': "import { useQuery } from '@tanstack/react-query'\nimport { getUsers } from '../api/getUsers'\nexport function useRemote(): number | undefined { return useQuery({ queryKey: ['users'], queryFn: getUsers }).data }\n",
  'src/features/users/model/useConnection.ts': "import { useEffect } from 'react'\nexport function useConnection(): void { useEffect(() => { const handle = (): void => {}; window.addEventListener('resize', handle); return () => window.removeEventListener('resize', handle) }, []) }\n",
  'src/features/users/ui/useFocus.ts': "import { useRef } from 'react'\nexport function useFocus(): void { useRef(null) }\n",
  'src/features/users/api/getUsers.ts': "export async function getUsers(): Promise<number> { const response = await fetch('/users'); const body: unknown = await response.json(); if (typeof body === 'number') return body; throw new Error('Invalid response') }\n",
  'src/app/page.tsx': "export default async function Page(): Promise<null> { await fetch('/users'); return null }\n",
  'src/app/api/users/route.ts': "export function GET(): Promise<Response> { return fetch('/users') }\n",
}
for (const [file, code] of Object.entries(initial)) write(file, code)
write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, baseUrl: '.', paths: { '@/*': ['src/*'] } }, include: ['src', 'types'] }))
write('types/query.d.ts', "declare module '@tanstack/react-query' { export function useQuery<T>(options: { queryKey: readonly unknown[]; queryFn: () => Promise<T> }): { data: T | undefined }; export function useMutation(options: unknown): unknown }\n")
write('package.json', JSON.stringify({ type: 'module', private: true }))
fs.mkdirSync(path.join(cwd, 'node_modules/@lodado'), { recursive: true })
fs.symlinkSync(here, path.join(cwd, 'node_modules/@lodado/eslint-config'), 'dir')
fs.mkdirSync(path.join(cwd, 'node_modules/@types'), { recursive: true })
const reactTypes = require.resolve('@types/react/package.json', { paths: [path.join(here, '../eslint-plugin-local-rules')] })
fs.symlinkSync(path.dirname(reactTypes), path.join(cwd, 'node_modules/@types/react'), 'dir')
write('strict-policy.mjs', `export default ${JSON.stringify(policy)}\n`)
write('eslint.config.mjs', "import base from '@lodado/eslint-config'\nimport strict from '@lodado/eslint-config/strict'\nimport policy from './strict-policy.mjs'\nexport default [...base, ...strict(policy)]\n")
after(() => fs.rmSync(cwd, { recursive: true, force: true }))
const createLinter = (extra = []) => new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [...base, ...strictProfile(policy), ...extra] })
const cli = (args = ['strict-policy.mjs']) => spawnSync(process.execPath, [path.join(here, 'strict-cli.mjs'), ...args], { cwd, encoding: 'utf8', timeout: 60000 })
const lint = async (code, file = 'src/features/users/ui/Panel.tsx', eslint = createLinter()) => {
  const [result] = await eslint.lintText(code, { filePath: path.join(cwd, file) })
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages))
  assert.ok(!result.messages.some((message) => /ignored|no matching configuration/iu.test(message.message)), JSON.stringify(result.messages))
  return result.messages
}
const reports = async (code, ruleId, messageId, file) => {
  const messages = await lint(code, file)
  const found = messages.filter((message) => message.ruleId === ruleId && (!messageId || message.messageId === messageId))
  assert.ok(found.length, `${ruleId}/${messageId}: ${JSON.stringify(messages)}`)
  for (const message of found) { assert.equal(message.severity, 2); assert.ok(message.line > 0 && message.column > 0) }
}

test('consumer imports public export, checks every source file, typechecks and exits zero', async () => {
  const eslint = new ESLint({ cwd })
  const files = await verifyStrictProject(eslint, policy)
  assert.equal(files.length, Object.keys(initial).length)
  const results = await eslint.lintFiles(files)
  assert.deepEqual(results.flatMap((result) => result.messages.filter((message) => message.severity === 2)), [])
  const run = cli()
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /source files checked/u)
  const typescript = require.resolve('typescript/bin/tsc', { paths: [path.join(here, '../eslint-plugin-local-rules')] })
  const typecheck = spawnSync(process.execPath, [typescript, '-p', 'tsconfig.json'], { cwd, encoding: 'utf8' })
  assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr)
})

test('runtime boundaries fail with the intended diagnostic, not parser errors', async () => {
  for (const code of [
    "import { useState as local } from 'react'; export const Panel = (): number => local(0)[0]",
    "import React from 'react'; export const Panel = (): number => React['useState'](0)[0]",
    "import { useQuery } from '@tanstack/react-query'; export const Panel = (): unknown => useQuery({queryKey: [], queryFn: async () => 1})",
    "import { useMutation } from '@tanstack/react-query'; export const Panel = (): unknown => useMutation({})",
    "export const Panel = (): Promise<Response> => globalThis.fetch('/users')",
    "import { getUsers } from '../api/getUsers'; export const Panel = (): Promise<number> => getUsers()",
  ]) await reports(code, '@lodado/local-rules/strict-ui-boundary', 'forbiddenRuntime')
  await reports("import { useQuery } from '@tanstack/react-query'; export const useFocus = (): unknown => useQuery({queryKey: [], queryFn: async () => 1})", '@lodado/local-rules/strict-ui-boundary', 'forbiddenRuntime', 'src/features/users/ui/useFocus.ts')
  await reports('export const Hidden = (): React.ReactNode => <div />', '@lodado/local-rules/strict-ui-boundary', 'viewImplementation', 'src/features/users/model/Hidden.tsx')
})

test('Promise handling cannot be bypassed by void and unsafe any still fails', async () => {
  const model = 'src/features/users/model/useUsers.ts'
  for (const code of ['Promise.resolve(1)', 'void Promise.resolve(1)']) await reports(code, 'ts/no-floating-promises', undefined, model)
  await reports('const pending = Promise.resolve(true); if (pending) { Math.abs(-1) }', 'ts/no-misused-promises', undefined, model)
  await reports('export const value: any = 1', 'ts/no-explicit-any', undefined, model)
  for (const [name, code] of [
    ['no-unsafe-assignment', 'export const value = JSON.parse("{}")'],
    ['no-unsafe-argument', 'declare function save(value: string): void; save(JSON.parse("{}"))'],
    ['no-unsafe-call', 'declare const run: any; run()'],
    ['no-unsafe-member-access', 'declare const value: any; export const name = value.name'],
    ['no-unsafe-return', 'export const parse = (): unknown[] => JSON.parse("[]")'],
  ]) await reports(code, `ts/${name}`, undefined, model)
  const normal = await lint('Promise.resolve(1).catch((error: unknown) => { console.error(error) })', model)
  assert.deepEqual(normal.filter((message) => message.ruleId === 'ts/no-floating-promises'), [])
})

test('Hooks, effect discipline and lifecycle hard errors also cover model owners', async () => {
  const model = 'src/features/users/model/useUsers.ts'
  await reports("import {useState} from 'react'; export function ordinary(): number { return useState(0)[0] }", 'react-hooks/rules-of-hooks', undefined, model)
  await reports("import {useState, useEffect} from 'react'; export function useDerived(value: number): number { const [copy,setCopy]=useState(0); useEffect(()=>{setCopy(value)},[value]); return copy }", 'react-hooks/set-state-in-effect', undefined, model)
  await reports("import {useEffect} from 'react'; export function useResize(): void { useEffect(()=>{window.addEventListener('resize',()=>{})},[]) }", '@eslint-react/web-api-no-leaked-event-listener', undefined, model)
  await reports("import {useState, useEffect} from 'react'; export function useChain(): number { const [a,setA]=useState(0); const [b,setB]=useState(0); useEffect(()=>{setA(1);setB(a)},[a]); return b }", 'react-you-might-not-need-an-effect/no-chain-state-updates', undefined, model)
  await reports("import {useState, useEffect} from 'react'; export function useSubmit(): number { const [pending,setPending]=useState(false); const submit=()=>{}; useEffect(()=>{if(pending) submit()},[pending]); return Number(pending) }", 'react-you-might-not-need-an-effect/no-event-handler', undefined, model)
  await reports('export function recover(): void { try { throw new Error("x") } catch (error) {} }', 'no-empty', undefined, model)
  await reports("import {useState} from 'react'; export function useBroken(): number { const [n,setN]=useState(0); setN(1); return n }", 'react-hooks/set-state-in-render', undefined, model)
  await reports("import {useEffect} from 'react'; export function useMissing(value: number): void { useEffect(()=>{ console.log(value) },[]) }", 'react-hooks/exhaustive-deps', undefined, model)
  await reports('export const Panel = (): React.ReactNode => <span>{Date.now()}</span>', 'react-hooks/purity')
  await reports('export const Panel = (props: {name: string}): React.ReactNode => { props.name = "changed"; return <span>{props.name}</span> }', 'react-hooks/immutability')
  await reports("import {useRef} from 'react'; export const Panel = (): React.ReactNode => { const ref=useRef(0); return <span>{ref.current}</span> }", 'react-hooks/refs')
  await reports('export const Panel = (): React.ReactNode => { const Inner=(): React.ReactNode => <span/>; return <Inner/> }', 'react-hooks/static-components')
  const draft = await lint("import {useState} from 'react'; export function useDraft(initial: string): readonly [string, (value: string) => void] { const [draft,setDraft]=useState(()=>initial); return [draft,setDraft] }", model)
  assert.deepEqual(draft.filter((message) => message.severity === 2), [])
})

test('resource leak rules reject missing cleanup and allow symmetric lifecycle ownership', async () => {
  const model = 'src/features/users/model/useConnection.ts'
  for (const [resource, setup, cleanup] of [
    ['timeout', 'const resource = setTimeout(() => {}, 10)', 'clearTimeout(resource)'],
    ['interval', 'const resource = setInterval(() => {}, 10)', 'clearInterval(resource)'],
    ['resize-observer', 'const resource = new ResizeObserver(() => {}); resource.observe(document.body)', 'resource.disconnect()'],
    ['intersection-observer', 'const resource = new IntersectionObserver(() => {}); resource.observe(document.body)', 'resource.disconnect()'],
  ]) {
    const effect = (release) => `import {useEffect} from 'react'; export function useConnection(): void { useEffect(()=>{${setup}; ${release}},[]) }`
    await reports(effect(''), `@eslint-react/web-api-no-leaked-${resource}`, undefined, model)
    const messages = await lint(effect(`return () => ${cleanup}`), model)
    assert.deepEqual(messages.filter((message) => message.severity === 2), [], JSON.stringify(messages))
  }
  await reports("import {useEffect} from 'react'; export function useConnection(): void { useEffect(()=>{ fetch('/users').catch(console.error) },[]) }", '@eslint-react/web-api-no-leaked-fetch', undefined, model)
})

test('Query recommended rules execute against model hooks rather than only being registered', async () => {
  const model = 'src/features/users/model/useRemote.ts'
  for (const [name, code] of [
    ['exhaustive-deps', "import {useQuery} from '@tanstack/react-query'; export function useRemote(id: number) { return useQuery({queryKey: ['user'], queryFn: async () => id}) }"],
    ['stable-query-client', "import {QueryClient} from '@tanstack/react-query'; export function useRemote() { const client = new QueryClient(); return client }"],
    ['no-rest-destructuring', "import {useQuery} from '@tanstack/react-query'; export function useRemote() { const {data,...rest}=useQuery({queryKey:['user'],queryFn:async()=>1}); return rest }"],
    ['no-unstable-deps', "import {useEffect} from 'react'; import {useQuery} from '@tanstack/react-query'; export function useRemote() { const query=useQuery({queryKey:['user'],queryFn:async()=>1}); useEffect(()=>console.log(query),[query]); return query.data }"],
  ]) await reports(code, `@tanstack/query/${name}`, undefined, model)
})

test('noInlineConfig and the coverage preflight detect suppression, ignores and later overrides', async () => {
  await reports("/* eslint-disable @lodado/local-rules/strict-ui-boundary */\nimport {useState} from 'react'; export const Panel = (): number => useState(0)[0]", '@lodado/local-rules/strict-ui-boundary', 'forbiddenRuntime')
  await assert.rejects(verifyStrictProject(createLinter([{ rules: { '@lodado/local-rules/strict-ui-boundary': 'off' } }]), policy), /weakened/u)
  await assert.rejects(verifyStrictProject(createLinter([{ ignores: ['src/features/users/ui/Panel.tsx'] }]), policy), /ignored/u)
  await assert.rejects(verifyStrictProject(createLinter([{ linterOptions: { noInlineConfig: false } }]), policy), /inline config/u)
  await assert.rejects(verifyStrictProject(createLinter([{ rules: { 'ts/no-floating-promises': ['error', { ignoreVoid: true }] } }]), policy), /Promise handling weakened/u)
  await assert.rejects(verifyStrictProject(createLinter([{ rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } }]), policy), /empty-catch handling weakened/u)
  await assert.rejects(verifyStrictProject(createLinter([{ rules: { 'react-you-might-not-need-an-effect/no-chain-state-updates': 'off' } }]), policy), /weakened/u)
  assert.throws(() => strictProfile({ ...policy, rendering: [] }), /nonempty/u)
  assert.throws(() => strictProfile({ ...policy, roots: [] }), /nonempty/u)
  await assert.rejects(verifyStrictProject(createLinter(), { ...policy, rendering: ['src/absent/*.tsx'] }), /zero files/u)
})

test('CLI distinguishes real lint failure 1 from policy/configuration failure 2', () => {
  write('src/features/users/ui/Panel.tsx', "import { useState } from 'react'; export const Panel = (): number => useState(0)[0]\n")
  try {
    const run = cli()
    assert.equal(run.status, 1, run.stdout + run.stderr)
    assert.match(run.stdout, /strict-ui-boundary/u)
    assert.equal(cli([]).status, 2)
  } finally { write('src/features/users/ui/Panel.tsx', initial['src/features/users/ui/Panel.tsx']) }
})

test('untracked and moved files remain in root coverage', async () => {
  write('src/moved/Panel.tsx', 'export const Panel = (): null => null')
  try {
    const files = await verifyStrictProject(createLinter(), policy)
    assert.ok(files.includes(path.join(cwd, 'src/moved/Panel.tsx')))
    await reports('export const Panel = (): null => null', '@lodado/local-rules/fsd-strict-boundaries', 'unclassifiedFile', 'src/moved/Panel.tsx')
  } finally { fs.rmSync(path.join(cwd, 'src/moved'), { recursive: true }) }
  write('src/node_modules/Hidden.tsx', 'export const Hidden = (): null => null')
  try {
    await assert.rejects(verifyStrictProject(createLinter(), policy), /excluded directory/u)
  } finally { fs.rmSync(path.join(cwd, 'src/node_modules'), { recursive: true }) }
})

test('strict keeps base restriction options and does not activate in base-only consumers', async () => {
  const plain = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: base })
  const file = path.join(cwd, 'src/features/users/ui/Panel.tsx')
  const before = await plain.calculateConfigForFile(file)
  const afterConfig = await createLinter().calculateConfigForFile(file)
  for (const rule of ['no-restricted-imports', 'no-restricted-globals', 'no-restricted-syntax']) assert.deepEqual(afterConfig.rules[rule], before.rules[rule])
  assert.equal(before.rules['@lodado/local-rules/strict-ui-boundary'], undefined)
  const messages = await lint("import {useState} from 'react'; export const Panel = (): number => useState(0)[0]", 'src/features/users/ui/Panel.tsx', plain)
  assert.ok(!messages.some((message) => message.ruleId?.startsWith('@lodado/local-rules/strict-')))
})

test('fsd composes with strict and fsdBoundaries, and each FSD defect reports once', async () => {
  const fsdMessages = async (configs, code, file) => {
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [...base, ...configs] })
    const [result] = await eslint.lintText(code, { filePath: path.join(cwd, file) })
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages))
    return result.messages.filter((message) => message.ruleId?.includes('/fsd-')).map((message) => `${message.ruleId}:${message.messageId}`)
  }
  const deep = "import { Panel } from '@/features/users/ui/Panel'\nexport default function Page(): null { Panel(); return null }\n"
  assert.deepEqual(await fsdMessages(fsd, deep, 'src/app/page.tsx'), ['@lodado/local-rules/fsd-no-deep-import:deepImport'])
  assert.deepEqual(await fsdMessages([...fsd, ...strictProfile(policy)], deep, 'src/app/page.tsx'), ['@lodado/local-rules/fsd-strict-boundaries:deepImport'])
  await assert.rejects(verifyStrictProject(createLinter(fsd), policy), /before strict/u)

  const boundaries = fsdBoundaries({ cwd, tsconfig: policy.tsconfig, roots: policy.roots })
  const upward = "import Page from '@/app/page'\nexport const page: unknown = Page\n"
  assert.deepEqual(await fsdMessages(fsd, upward, 'src/features/users/model/page.ts'), ['@lodado/local-rules/fsd-layer-direction:upward'])
  assert.deepEqual(await fsdMessages([...fsd, ...boundaries], upward, 'src/features/users/model/page.ts'), ['@lodado/local-rules/fsd-strict-boundaries:layerDirection'])
  assert.throws(() => fsdBoundaries({ ...policy, cwd: 'relative' }), /absolute/u)
  assert.throws(() => fsdBoundaries({ ...policy, roots: [{ path: 'src/**' }] }), /literal/u)
})
