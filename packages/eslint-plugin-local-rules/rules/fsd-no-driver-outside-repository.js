/**
 * DB driver / ORM imports stay inside the data-access boundary: shared db infrastructure
 * (client, migrations, seed) and slice api repositories. Route handlers, RSC, ui and
 * model receive data through the repository. Ships off - the `fsd` preset turns it on.
 */
const { relativeFilename, importVisitors } = require('./lib/fsd-path')

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

const isDefaultAllowedPath = (filename) => {
  const segments = filename.split('/').filter(Boolean)
  const basename = segments.at(-1) || ''
  return (
    (segments.includes('shared') && segments[segments.indexOf('shared') + 1] === 'api') ||
    segments.includes('migrations') ||
    segments.includes('db') ||
    segments.includes('seed') ||
    /^seed\.[^.]+$/.test(basename) ||
    basename.includes('.repository.')
  )
}

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
    const allow = options.allow
    // cwd-relative, so a checkout under a folder named db or seed does not exempt every file; the
    // leading slash keeps `allow` fragments written against absolute paths (`/src/server/`) matching.
    const filename = `/${relativeFilename(context)}`

    if (allow ? allow.some((fragment) => filename.includes(fragment)) : isDefaultAllowedPath(filename)) {
      return {}
    }

    const isDriver = (source) => drivers.some((driver) => source === driver || source.startsWith(`${driver}/`))

    const check = (node, source) => {
      if (typeof source === 'string' && isDriver(source)) {
        context.report({ node, messageId: 'driverOutsideBoundary', data: { source } })
      }
    }

    return {
      ...importVisitors(check),
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
