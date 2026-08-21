/** Turborepo preset (flat): flags env vars used in code but missing from turbo.json. */
const turbo = require('eslint-config-turbo/flat')

const configs = turbo.default ?? turbo

module.exports = Array.isArray(configs) ? [...configs] : [configs]
