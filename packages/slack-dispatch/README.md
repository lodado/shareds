# @lodado/slack-dispatch

Turns the Slack threads that tag you into reviewed pull requests, with you approving each step in a Slack DM.

1. **Poll** Slack for new mentions and route each to a repository by rule (GitHub link, repo name, channel table).
2. **Digest DM**: one section per new item with what was asked, the likely cause, a plan and a recommendation, read by the
   cheapest model. Recommended items arrive already checked.
3. **Plan** each ticked item in an Orca worktree (`claude -p`, plan mode) and post a plan card. Reply in its thread to ask
   for changes.
4. **Build** after you approve the plan: dependencies installed, the change committed, Visual QA run on the screens it
   touched (the repo's own dev server, screenshots, a model that looks at them).
5. **Pull request** only when `ENABLE_PR=1`; merging needs your click, passing CI and an approved review.

You can also DM the bot a free-form request; it is split per repository and goes straight to planning.

## Run

```sh
pnpm start          # the service (Socket Mode); settings in .env, see .env.example
pnpm dry-run        # read-only look at today's mentions; sends nothing
pnpm lint && pnpm test
```

Tokens (`xoxb-`, `xoxp-`, `xapp-`) are read from the macOS keychain, never from files. State lives in `~/.slack-dispatch`.
A lock file keeps a second service from starting on the same folder.

## How it stays safe

- The item state machine (`src/machine`) and the run lifecycle (`src/run`) are modelled in Bend; the laws are proven there
  and generated tests compare the code with the model (`src/*/__test__/formal`, generated, do not edit).
- Only the owner can act; every id in a click is checked against the store; every event is logged, append-only, with
  secrets redacted.
- The agents get a limited environment and tool list; text from Slack is data inside a `<thread>` block and is escaped
  before it goes back into Slack.
- Spending is capped per item; at most 3 runs at a time, 1 per repository.
