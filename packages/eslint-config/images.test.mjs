import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { ESLint } from 'eslint'

import images from './images.mjs'

const lintWith = (appImageModules) => (code, filePath) => new ESLint({ cwd: process.cwd(), overrideConfigFile: true, overrideConfig: [{ files: ['**/*.{js,jsx,ts,tsx}'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }, ...images({ appImageModules })] }).lintText(code, { filePath })
const lint = lintWith(['@/ui/AppImage'])
const lintCss = (code, filePath) => new ESLint({ cwd: process.cwd(), overrideConfigFile: true, overrideConfig: images({ css: true }) }).lintText(code, { filePath })
const reported = (result) => result.messages.map(({ messageId }) => messageId)

test('images preset catches JS and JSX image bypasses but keeps the shared module and SVGs usable', async () => {
  const [result] = await lint("import Image from 'next/image'\nimport hero from './hero.png'\nimport icon from './icon.svg'\nconst x = require('./x.webp')\nexport const View = () => <><img src={hero} className=\"bg-[url(hero.png)]\" {...props} style={{ backgroundImage: 'url(hero.png)' }} /><Image src={hero} /></>", path.join(process.cwd(), 'sample.tsx'))
  assert.equal(result.errorCount, 7)
  assert.ok(result.messages.every(({ ruleId }) => ruleId === '@lodado/local-rules/no-image-bypass'))
  const [allowed] = await lint("import AppImage from '@/ui/AppImage'\nexport const View = () => <AppImage src=\"hero.png\" />", path.join(process.cwd(), 'allowed.tsx'))
  assert.equal(allowed.errorCount, 0)
  const [boundary] = await lint("import Image from 'next/image'\nexport default Image", path.join(process.cwd(), 'ui', 'app-image.tsx'))
  assert.equal(boundary.errorCount, 0)
})

// A project may keep two gateways: one through the optimiser (next/image) and one that draws a logo or mark as the file
// it is. The second has to render the <img> itself.
test('a gateway module may render the raw <img> it wraps', async () => {
  const [mark] = await lintWith(['@/shared/ui/Img', '@/shared/ui/Mark'])("export default function Mark({ src, fallback, ...rest }) { return <picture><source srcSet={src} type='image/webp' /><img {...rest} src={fallback} /></picture> }", path.join(process.cwd(), 'src', 'shared', 'ui', 'Mark.tsx'))
  assert.deepEqual(reported(mark), [])
})

test('a file is a gateway only when its path ends in the whole module path, not just the last name', async () => {
  const [productMark] = await lintWith(['@/shared/ui/Mark'])("import Image from 'next/image'\nexport const Logo = () => <><Image src='/a.webp' alt='' /><img src='/a.webp' alt='' /></>", path.join(process.cwd(), 'src', 'shared', 'ui', 'ProductMark.tsx'))
  assert.deepEqual(reported(productMark), ['nextImage', 'element'])
  const [elsewhere] = await lintWith(['@/shared/ui/Mark'])("export const Logo = () => <img src='/a.webp' alt='' />", path.join(process.cwd(), 'src', 'entities', 'logo', 'Mark.tsx'))
  assert.deepEqual(reported(elsewhere), ['element'])
})

// JSX reads a capitalised name as a component, so <Img> is the shared gateway itself, not the raw element
test('a component named Img is the gateway in use, not a raw <img>', async () => {
  const [result] = await lintWith(['@/shared/ui/Img'])("import { Img } from '@/shared/ui'\nexport const Hero = () => <Img src='/a.webp' alt='' fill />", path.join(process.cwd(), 'src', 'pages', 'home.tsx'))
  assert.deepEqual(reported(result), [])
})

test('a dynamic import of next/image outside a gateway is a bypass too', async () => {
  const [result] = await lintWith(['@/shared/ui/Img'])("export const load = () => import('next/image')", path.join(process.cwd(), 'src', 'pages', 'home.tsx'))
  assert.deepEqual(reported(result), ['nextImage'])
})

// The base preset applies its JavaScript rules to every file it lints, and those rules crash on a stylesheet
// ("sourceCode.getAllComments is not a function"), so CSS checking is the caller's choice
test('stylesheets are left alone unless CSS checking is asked for', async () => {
  const { default: base } = await import('./index.mjs')
  const eslint = (config) => new ESLint({ cwd: process.cwd(), overrideConfigFile: true, overrideConfig: config })
  const [result] = await eslint([...base, ...images()]).lintText('.hero { background: url(hero.png) }\n', { filePath: path.join(process.cwd(), 'sample.css') })
  // no block matches a stylesheet, so ESLint passes it over instead of running the JavaScript rules on it
  assert.deepEqual(result.messages.map(({ message }) => message), ['File ignored because no matching configuration was supplied.'])
})

test('CSS image URLs are parsed and font-face sources are allowed', async () => {
  const [result] = await lintCss('@font-face { font-family: Demo; src: url(demo.woff2) } .hero { background: image-set(url(hero.png) 1x); }', path.join(process.cwd(), 'sample.css'))
  assert.equal(result.errorCount, 1)
  assert.equal(result.messages[0].ruleId, '@lodado/local-rules/no-css-image-url')
})
