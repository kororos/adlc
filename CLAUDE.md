# Working on ADLC

## Docs go with every change
Every change to a command, flag, dashboard feature or behaviour updates the docs in the same piece of work. Before calling it done, check and update:
- `README.md`: the section for the feature, the **Operating the runner** command table (including the `adlc logs` options), and **What to do when…** (§16) if it changes how a problem is fixed.
- The Field Guide (`ui/web/public/guide/index.html`, `guide.js`): the tutorial steps, the `CMDS` command rows and the `FIXES` list (same scenarios as the README's §16).
- The usage header at the top of `bin/adlc`.

## Creating a stack
When asked to create a stack (an organization's conventions for a kind of application), follow `docs/stacks/README.md`.

## What reloads what
- `adlc restart <slug>` reloads only the plugins (`plugins/`). Bump the plugin's `version` in `.claude-plugin/plugin.json` when you change it.
- The runner scripts (`sandbox/runner/bin/`) are baked into the image and need `adlc up <slug>`, on a CI-only host too.
- The dashboard (`ui/`) needs `adlc ui up`.
