/**
 * JS/TS source glob. The Antfu base also lints Markdown, JSON and YAML, so a preset block
 * without `files` runs its JS rules on those languages too, where they crash or misfire.
 */
const CODE_FILES = ['**/*.?([cm])[jt]s?(x)']

/** Scope a block to source files unless it already names its own files. */
const forCode = (config) => (config.files ? config : { ...config, files: CODE_FILES })

module.exports = { CODE_FILES, forCode }
