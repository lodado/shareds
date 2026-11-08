import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { ESLint } from 'eslint'

import images from './images.mjs'

const lint = (code, filePath) => new ESLint({ cwd: process.cwd(), overrideConfigFile: true, overrideConfig: [{ files: ['**/*.{js,jsx,ts,tsx}'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }, ...images({ appImageModules: ['@/ui/AppImage'] })] }).lintText(code, { filePath })

test('images preset catches JS and JSX image bypasses but keeps the shared module and SVGs usable', async () => {
  const [result] = await lint("import Image from 'next/image'\nimport hero from './hero.png'\nimport icon from './icon.svg'\nconst x = require('./x.webp')\nexport const View = () => <><img src={hero} className=\"bg-[url(hero.png)]\" style={{ backgroundImage: 'url(hero.png)' }} /><Image src={hero} /></>", path.join(process.cwd(), 'sample.tsx'))
  assert.equal(result.errorCount, 7)
  assert.ok(result.messages.every(({ ruleId }) => ruleId === '@lodado/local-rules/no-image-bypass'))
  const [allowed] = await lint("import AppImage from '@/ui/AppImage'\nexport const View = () => <AppImage src=\"hero.png\" />", path.join(process.cwd(), 'allowed.tsx'))
  assert.equal(allowed.errorCount, 0)
  const [boundary] = await lint("import Image from 'next/image'\nexport default Image", path.join(process.cwd(), 'ui', 'app-image.tsx'))
  assert.equal(boundary.errorCount, 0)
})

test('CSS image URLs are parsed and font-face sources are allowed', async () => {
  const [result] = await lint('@font-face { font-family: Demo; src: url(demo.woff2) } .hero { background: image-set(url(hero.png) 1x); }', path.join(process.cwd(), 'sample.css'))
  assert.equal(result.errorCount, 1)
  assert.equal(result.messages[0].ruleId, '@lodado/local-rules/no-css-image-url')
})
