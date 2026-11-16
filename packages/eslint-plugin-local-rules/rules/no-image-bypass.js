const RASTER = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/iu
const IMAGE_URL = /url\s*\(|image-set\s*\(/iu
const SOURCE = /\.(?:[cm]?[jt]sx?)$/iu
// A path as its segments, each lowercased with separators dropped ('app-image' and 'AppImage' agree), the source
// extension and the alias segments ('@/', '~/') gone.
const segments = (value) =>
  value
    .replace(SOURCE, '')
    .split(/[/\\]/u)
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]/gu, ''))
    .filter(Boolean)
// A file is a gateway when its path ends in the module's whole path: '@/shared/ui/Mark' is src/shared/ui/Mark.tsx,
// not src/shared/ui/ProductMark.tsx or src/entities/logo/Mark.tsx.
const endsWith = (file, module) =>
  module.length > 0 &&
  module.length <= file.length &&
  module.every((part, i) => file[file.length - module.length + i] === part)

const nameOf = (node) => (node?.type === 'JSXIdentifier' ? node.name : null)
const literalText = (node) =>
  node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : node?.type === 'TemplateLiteral'
    ? node.quasis.map((part) => part.value.raw).join('')
    : null

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'keep application images behind the shared image component' },
    schema: [
      {
        type: 'object',
        properties: { appImageModules: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      element: 'Use the shared AppImage component instead of a raw <img>.',
      nextImage: 'Import the shared AppImage component instead of next/image.',
      rasterImport: 'Import raster assets through the shared AppImage pipeline.',
      require: 'Load raster assets through the shared AppImage pipeline.',
      inlineUrl: 'Keep image URLs out of inline styles; use the shared AppImage component.',
      tailwindUrl: 'Keep image URLs out of Tailwind classes; use the shared AppImage component.',
    },
  },
  create(context) {
    const modules = (context.options[0]?.appImageModules ?? ['@/shared/ui/AppImage']).map(segments)
    const file = segments(context.filename ?? '')
    // the gateway itself wraps next/image or renders the <img>; every other file goes through it
    const isAppImageModule = SOURCE.test(context.filename ?? '') && modules.some((module) => endsWith(file, module))
    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (source === 'next/image' && !isAppImageModule) context.report({ node: node.source, messageId: 'nextImage' })
        else if (RASTER.test(source)) context.report({ node: node.source, messageId: 'rasterImport' })
      },
      ImportExpression(node) {
        if (literalText(node.source) === 'next/image' && !isAppImageModule)
          context.report({ node: node.source, messageId: 'nextImage' })
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          RASTER.test(literalText(node.arguments[0]) ?? '')
        )
          context.report({ node, messageId: 'require' })
      },
      JSXOpeningElement(node) {
        // exactly 'img': JSX reads a capitalised name (<Img>) as a component, such as the gateway itself
        if (nameOf(node.name) === 'img' && !isAppImageModule) context.report({ node: node.name, messageId: 'element' })
        for (const attribute of node.attributes) {
          const name = nameOf(attribute.name)
          const value = literalText(attribute.value)
          if (name === 'className' && value && IMAGE_URL.test(value))
            context.report({ node: attribute, messageId: 'tailwindUrl' })
          if (name === 'style' && IMAGE_URL.test(context.sourceCode.getText(attribute.value)))
            context.report({ node: attribute, messageId: 'inlineUrl' })
        }
      },
      Property(node) {
        const key = node.key.type === 'Identifier' ? node.key.name : node.key.value
        if (['background', 'backgroundImage', 'content'].includes(key) && IMAGE_URL.test(literalText(node.value) ?? ''))
          context.report({ node: node.value, messageId: 'inlineUrl' })
      },
    }
  },
}
