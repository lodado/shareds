# Repository instructions

After successfully committing and pushing changes under `packages/frontend-oracle-design/skills/`,
sync that source to the local Claude, Codex, and JCode skill directories:

```sh
for host in claude codex jcode; do
  rsync -a packages/frontend-oracle-design/skills/ "$HOME/.$host/skills/frontend-oracle-design/"
done
```

Run this only after the push succeeds. This copies source files without deleting host-local files;
verify the three installs against the repository source and preserve local-only data.
