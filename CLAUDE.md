# Repository instructions

Claude and Codex load this repository's skills only through the `my-vibe-coding-helper` plugins.
Do not copy them into `~/.claude/skills`, `~/.codex/skills`, or `~/.agents/skills` (Codex reads
it too): a second copy shows up as a duplicate, often stale, entry in the skill list. JCode has
no plugin system, so it keeps plain copies in `~/.jcode/skills/`.

After successfully committing and pushing a change under `packages/<plugin>/skills/`, with the
version bump its contract test requires, refresh the installs:

```sh
git -C ~/orca/my-Vibe-Coding-Helper merge --ff-only main  # marketplace root; skip if it has local work
claude plugin marketplace update my-vibe-coding-helper
claude plugin update <plugin>@my-vibe-coding-helper
codex plugin add <plugin>@my-vibe-coding-helper
rsync -a packages/<plugin>/skills/<skill>/ "$HOME/.jcode/skills/<skill>/"
```

A flat layout (`packages/<plugin>/skills/SKILL.md`, e.g. frontend-oracle-design) copies
`skills/` to `~/.jcode/skills/<plugin>/`. Run this only after the push succeeds. The rsync does
not delete host-local files; verify each install against the repository source and preserve
local-only data. Restart Claude to load the new plugin version.
