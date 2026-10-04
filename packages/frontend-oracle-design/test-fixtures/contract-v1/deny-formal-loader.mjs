import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// Reject, never replace, forbidden ESM loads. Not a subprocess/CJS/network sandbox.
const formal = new Set([
  'oracle-adequacy.mjs', 'oracle-package.mjs', 'oracle-model.mjs',
  'ensure-bend.mjs', 'oracle-projection.mjs', 'oracle-discovery.mjs',
  'oracle-cli.mjs', 'oracle-types.mjs', 'install-bend.mjs', 'setup-bend.mjs',
])
const network = new Set(['http', 'https', 'http2', 'net', 'tls', 'dns', 'dns/promises', 'dgram', 'undici'])

function denied(code, identity) {
  throw Object.assign(new Error(`${code}:${identity}`), { code })
}

export async function resolve(specifier, context, nextResolve) {
  if (/^(https?|wss?|ftp):/i.test(specifier) || network.has(specifier.replace(/^node:/, ''))) {
    denied('NETWORK_IMPORT_DENIED', specifier)
  }
  const resolved = await nextResolve(specifier, context)
  if (resolved.url.startsWith('node:') && network.has(resolved.url.slice(5))) {
    denied('NETWORK_IMPORT_DENIED', resolved.url)
  }
  if (/^(https?|wss?|ftp):/i.test(resolved.url)) denied('NETWORK_IMPORT_DENIED', resolved.url)
  if (resolved.url.startsWith('file:')) {
    const path = fileURLToPath(resolved.url)
    // Exact known core filenames in a scripts directory, not arbitrary 'model' substrings.
    if (path.split('/').includes('scripts') && formal.has(basename(path))) {
      denied('FORMAL_IMPORT_DENIED', resolved.url)
    }
  }
  return resolved
}
