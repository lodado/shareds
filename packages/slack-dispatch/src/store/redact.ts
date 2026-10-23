// Everything written to the event log passes through here first, so a token that appears in a Slack payload,
// a command line or an error message never reaches the disk.
const SECRET_PATTERNS: readonly RegExp[] = [
  /xox[abeoprs]-[A-Za-z0-9-]+/g, // Slack bot, user, app and legacy tokens
  /xapp-[A-Za-z0-9-]+/g, // Slack app-level token
  /hooks\.slack\.com\/services\/[\w/]+/g, // Slack incoming webhook URL
  /sk-ant-[\w-]+/g, // Anthropic API key
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_\w{20,}/g, // GitHub fine-grained token
  // Authorization header values. The whitespace may still be the two characters `\n` when the text is JSON.
  /\bBearer(?:\s|\\[nrt])+[\w.~+/=-]{8,}/gi,
  // Basic credentials: the whole Authorization header when there is one, whatever the token looks like; on its own
  // only when the token has a digit or base64 punctuation, so the plain words "basic authentication" stay readable.
  /\bAuthorization["']?\s{0,3}[:=]\s{0,3}["']?Basic\s{1,3}[\w+/=-]{4,}/gi,
  /\bBasic(?:\s|\\[nrt])+(?=[\w+/-]*[\d=+/])[\w+/=-]{8,}/gi,
]

export const REDACTED = '[REDACTED]'

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, REDACTED), text)
}
