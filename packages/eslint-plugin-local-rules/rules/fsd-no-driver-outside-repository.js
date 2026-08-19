/**
 * DB driver / ORM imports stay inside the data-access boundary: shared db infrastructure
 * (client, migrations, seed) and slice api repositories. Route handlers, RSC, ui and
 * model receive data through the repository. Ships off - the `fsd` preset turns it on.
 */
const { normalize } = require('./lib/fsd-path')

const DEFAULT_DRIVERS = [
  '@prisma/client',
  'better-sqlite3',
  'drizzle-orm',
  'knex',
  'kysely',
  'mongodb',
  'mongoose',
  'mysql2',
  'pg',
  'prisma',
  'sqlite3',
  'typeorm',
]

const DEFAULT_ALLOW = ['/shared/api/', '.repository.', '/migrations/', '/db/', 'seed']

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'restrict DB driver/ORM imports to db infrastructure and repository modules',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          drivers: { type: 'array', items: { type: 'string' } },
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      driverOutsideBoundary:
        "'{{source}}' is a data-access dependency. Import it only in db infrastructure or a *.repository.* module; everything else goes through the repository.",
    },
  },
  create(context) {
    const options = context.options[0] || {}
    const drivers = options.drivers || DEFAULT_DRIVERS
    const allow = options.allow || DEFAULT_ALLOW
    const filename = normalize(context.getFilename())

    if (allow.some((fragment) => filename.includes(fragment))) {
      return {}
    }

    const isDriver = (source) => drivers.some((driver) => source === driver || source.startsWith(`${driver}/`))

    const check = (node, source) => {
      if (typeof source === 'string' && isDriver(source)) {
        context.report({ node, messageId: 'driverOutsideBoundary', data: { source } })
      }
    }

    return {
      ImportDeclaration(node) {
        check(node.source, node.source.value)
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          check(node.source, node.source.value)
        }
      },
      ExportAllDeclaration(node) {
        check(node.source, node.source.value)
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          check(node.source, node.source.value)
        }
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length > 0) {
          const [argument] = node.arguments
          if (argument.type === 'Literal') {
            check(argument, argument.value)
          }
        }
      },
    }
  },
}
