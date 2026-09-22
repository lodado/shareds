const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { RuleTester } = require('eslint')
const parser = require('@typescript-eslint/parser')
const rule = require('./rules/strict-ui-boundary')

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-ui-'))
const write = (file, code) => {
  const target = path.join(cwd, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, code)
}
write(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      baseUrl: '.',
      paths: { '@/*': ['src/*'] },
      jsx: 'react-jsx',
      moduleResolution: 'bundler',
      module: 'esnext',
    },
  }),
)
write('src/shared/lib/react.ts', "export { useState as state } from 'react'")
write('src/shared/lib/star.ts', "export * from './react'")
write('src/shared/lib/nested.ts', "export { state as hidden } from './react'")
write('src/shared/lib/request.ts', 'export const request = () => Promise.resolve(1)')
write('src/shared/lib/wrapped.ts', "export { request as send } from './request'")
write('src/shared/lib/transport.ts', "export { default as request } from 'axios'")
write('src/shared/lib/namespaces.ts', "export * as React from 'react'; export * as Query from '@tanstack/react-query'")
write('src/shared/lib/imported-namespace.ts', "import * as React from 'react'; export { React }")
write('src/features/users/api/getUsers.ts', 'export const getUsers = () => fetch("/users")')
write('src/features/users/model/useUsers.ts', 'export const useUsers = () => []')
write('src/features/users/ui/Panel.tsx', 'export const Panel = () => null')
const options = {
  cwd,
  tsconfig: path.join(cwd, 'tsconfig.json'),
  roots: [{ path: 'src' }],
  rendering: ['src/**/ui/**/*.{ts,tsx}'],
  viewHooks: ['src/**/ui/useFocus.ts'],
  sharedRuntime: ['src/shared/lib/browser/useResize.ts'],
  server: ['src/app/api/**', 'src/app/page.tsx', 'src/features/users/ui/ClientPage.tsx'],
  modules: [
    { source: '@/shared/lib/request', exports: ['request'], kind: 'transport' },
    { source: 'zustand', exports: ['create', 'useStore'], kind: 'store' },
    { source: 'request-client', exports: ['request'], kind: 'transport' },
    { source: 'react-hook-form', exports: ['useForm'], kind: 'orchestration' },
    { source: 'next/navigation', exports: ['useRouter'], kind: 'orchestration' },
  ],
  reactAllow: [{ files: ['src/features/users/ui/Label.tsx'], exports: ['useId'], reason: 'Accessible control IDs' }],
}
const ui = 'src/features/users/ui/Panel.tsx'
const valid = (code, file = ui) => ({ code, filename: path.join(cwd, file), options: [options] })
const invalid = (code, messageId = 'forbiddenRuntime', file = ui) => ({ ...valid(code, file), errors: [{ messageId }] })
const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
})
try {
  tester.run('strict-ui-boundary', rule, {
    valid: [
      valid("import type { useState, ReactNode } from 'react'; export type Props = { children: ReactNode }"),
      valid(
        "import React, { Fragment, createElement, memo, forwardRef } from 'react'; export default memo(() => createElement(Fragment))",
      ),
      valid('const React = { useState() {} }; React.useState()'),
      valid("import { React } from '@/shared/lib/namespaces'; React.createElement(React.Fragment)"),
      valid("import { React } from '@/shared/lib/imported-namespace'; React.memo(() => null)"),
      valid('const local = { fetch() {}, window: 1 }; local.fetch()'),
      valid(
        'function run(fetch, window, globalThis, self) { fetch(); window.fetch(); globalThis.fetch(); self.fetch() }',
      ),
      valid("import { useUsers } from '../model/useUsers'; export default () => useUsers()"),
      valid("import { useId } from 'react'; export const Label = () => useId()", 'src/features/users/ui/Label.tsx'),
      valid(
        "import { useState, useEffect } from 'react'; export const useFocus = () => { const [x] = useState(1); useEffect(() => { const id = setTimeout(() => {}, 1); return () => clearTimeout(id) }, []); return x }",
        'src/features/users/ui/useFocus.ts',
      ),
      valid(
        "import { useState } from 'react'; import { useQuery } from '@tanstack/react-query'; export const useUsers = () => { useState(1); return useQuery({}) }",
        'src/features/users/model/useUsers.ts',
      ),
      valid('export const getUsers = () => fetch("/users")', 'src/features/users/api/getUsers.ts'),
      valid('export const GET = () => fetch("/users")', 'src/app/api/users/route.ts'),
      valid('export default async function Page() { await fetch("/users"); return <main /> }', 'src/app/page.tsx'),
      valid(
        "import { useEffect } from 'react'; export const useResize = () => useEffect(() => {}, [])",
        'src/shared/lib/browser/useResize.ts',
      ),
      valid(
        "import type { ReactNode } from 'react'; export type Props = { children: ReactNode }",
        'src/features/users/model/types.ts',
      ),
      valid('export default function Panel() { return <div/> }'),
      valid('export default () => <div/>'),
      valid('const callbacks = { run() {} }; [1].map(function () { return callbacks })'),
      valid("function f(require) { return require('react').useState }"),
      valid(
        "import * as React from 'react'; export const Panel = () => React.createElement(React.Fragment)",
        'src/features/users/ui/ClientPage.tsx',
      ),
    ],
    invalid: [
      ...['useState', 'useEffect', 'useRef', 'useContext', 'useMemo', 'useCallback', 'useId'].map((name) =>
        invalid(`import { ${name} as primitive } from 'react'; primitive()`),
      ),
      ...['React.useState', "React['useState']"].map((expr) => invalid(`import React from 'react'; ${expr}(0)`)),
      invalid("import * as R from 'react'; R.useState(0)"),
      invalid("import { React } from '@/shared/lib/namespaces'; React.useState(0)"),
      invalid("import { React } from '@/shared/lib/imported-namespace'; React.useState(0)"),
      invalid("import { Query } from '@/shared/lib/namespaces'; Query.useQuery({})"),
      invalid("import { useState } from 'react'; useState(0)", 'forbiddenRuntime', 'src/features/users/lib/renamed.ts'),
      invalid('export default () => <div />', 'viewImplementation', 'src/features/users/lib/renamed.tsx'),
      invalid("import React from 'react'; const { useState: state } = React; state(0)"),
      invalid("import React from 'react'; const state = React.useState; state(0)"),
      invalid(
        "import { useState } from 'react'; function useHiddenState() { return useState(0) }; export default function Panel() { return useHiddenState() }",
      ),
      invalid("import { useQuery as read } from '@tanstack/react-query'; read({})"),
      invalid("import * as Query from '@tanstack/react-query'; Query.useMutation({})"),
      invalid("const { useState: state } = await import('react'); state(0)"),
      invalid("const R = require('react'); R['useEffect'](() => {})"),
      invalid("import { hidden } from '@/shared/lib/nested'; hidden(0)"),
      invalid("export { state } from '@/shared/lib/react'"),
      invalid("export * from '@/shared/lib/react'"),
      invalid("export * from '@/shared/lib/star'"),
      invalid("export * from 'react'"),
      ...[
        'fetch("/users")',
        'globalThis.fetch("/users")',
        'window["fetch"]("/users")',
        'self.fetch("/users")',
        'const request = fetch; request("/users")',
        'const { fetch: request } = globalThis; request("/users")',
      ].map((code) => invalid(code)),
      invalid("import axios from 'axios'; axios.get('/users')"),
      invalid("window.addEventListener('resize', () => {})"),
      invalid('setTimeout(() => {}, 1)'),
      invalid('new ResizeObserver(() => {})'),
      invalid("const { useState: state } = require('react'); state(0)"),
      invalid("import ky from 'ky'; ky('/users')"),
      invalid("import { request } from 'request-client'; request('/users')"),
      invalid("import { request } from '@/shared/lib/transport'; request('/users')"),
      invalid("import { send } from '@/shared/lib/wrapped'; send()"),
      invalid("import { getUsers } from '../api/getUsers'; getUsers()"),
      {
        ...invalid('fetch("/users")', 'forbiddenRuntime', 'src/features/users/api/Panel.ts'),
        options: [{ ...options, rendering: ['src/features/users/api/Panel.ts'] }],
      },
      invalid("export { getUsers } from '../api/getUsers'"),
      invalid("await import('../api/getUsers')"),
      invalid("const api = require('../api/getUsers')"),
      invalid(
        "import { PrismaClient } from '@prisma/client'; new PrismaClient()",
        'forbiddenRuntime',
        'src/features/users/ui/Panel.repository.tsx',
      ),
      invalid(
        "import { PrismaClient } from '@prisma/client'; new PrismaClient()",
        'forbiddenRuntime',
        'src/features/users/ui/seed.tsx',
      ),
      invalid(
        "import { useQuery } from '@tanstack/react-query'; useQuery({})",
        'forbiddenRuntime',
        'src/features/users/ui/useFocus.ts',
      ),
      invalid(
        "import { getUsers } from '../api/getUsers'; getUsers()",
        'forbiddenRuntime',
        'src/features/users/ui/useFocus.ts',
      ),
      invalid(
        "import { useUsers } from '../model/useUsers'; useUsers()",
        'forbiddenRuntime',
        'src/features/users/ui/useFocus.ts',
      ),
      invalid(
        "import { create } from 'zustand'; create({})",
        'forbiddenRuntime',
        'src/shared/lib/browser/useResize.ts',
      ),
      invalid("import { useForm } from 'react-hook-form'; useForm()"),
      invalid("import { useRouter } from 'next/navigation'; useRouter()"),
      invalid('export const Hidden = () => <div />', 'viewImplementation', 'src/features/users/model/hidden.tsx'),
      invalid(
        "import { createElement as h } from 'react'; export const Hidden = () => h('div')",
        'viewImplementation',
        'src/features/users/api/hidden.ts',
      ),
      invalid(
        "import React from 'react'; export const Hidden = () => React.createElement('div')",
        'viewImplementation',
        'src/features/users/model/hidden.ts',
      ),
      invalid(
        "import { jsx as h } from 'react/jsx-runtime'; export const Hidden = () => h('div', {})",
        'viewImplementation',
        'src/features/users/model/hidden.ts',
      ),
      invalid(
        "import { cloneElement } from 'react'; export const Hidden = (element) => cloneElement(element)",
        'viewImplementation',
        'src/features/users/api/hidden.ts',
      ),
      invalid(
        "'use client'; import { useState } from 'react'; export const ClientPage = () => useState(0)[0]",
        'forbiddenRuntime',
        'src/features/users/ui/ClientPage.tsx',
      ),
      invalid("export * as React from 'react'", 'forbiddenRuntime'),
      invalid(
        "export const Panel = () => <Promise<Response>>fetch('/users')",
        'forbiddenRuntime',
        'src/features/users/ui/typed.ts',
      ),
      invalid("export { Panel } from '../ui/Panel'", 'viewImplementation', 'src/features/users/model/index.ts'),
    ],
  })
  assert.equal(rule.meta.docs.recommended, false)
} finally {
  fs.rmSync(cwd, { recursive: true, force: true })
}
