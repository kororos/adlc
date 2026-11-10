# Creating a stack: instructions for Claude

You are creating a **stack** for ADLC: the conventions an organization uses for one kind of application (for example "our Spring Boot services", "our internal React admin apps", "our ESP32 firmware"), packaged so that every ADLC agent follows them when it designs, builds, tests, reviews and deploys that kind of application.

A stack is not framework documentation. The model already knows the frameworks. A stack holds **what this organization decided**: the libraries it standardised on, its project layout, its security, logging and API rules, how its code is tested, built and deployed, what its reviewers check. Generic advice that any competent developer would follow anyway doesn't belong in it.

Read README §15 ("Stacks: what ADLC knows about your technology") first, and look at an existing stack before you write one: `plugins/stack-node-api/` is the smallest, `plugins/stack-react-native/` shows test environments and CI jobs.

## How a stack is wired

A stack named `<name>` is up to five parts, found **by file name**. Nothing else needs registering:

| Part | Path | Required |
|---|---|---|
| Plugin with skills | `plugins/stack-<name>/.claude-plugin/plugin.json`, `plugins/stack-<name>/skills/<skill>/SKILL.md` | yes |
| Marketplace entry | `.claude-plugin/marketplace.json` | yes |
| Tools on the dev server | `sandbox/runner/stacks/<name>.Dockerfile` | only if the agents need tools the base image lacks |
| Network allowlist | `sandbox/egress/domains/<name>.txt` | only if it downloads from hosts outside `core.txt` |
| Extra setup questions | `plugins/stack-<name>/skills/<name>-setup/SKILL.md` | only if init must ask something stack-specific |

A project enables it with `stacks: [<name>, …]` in its `adlc.yaml`. On `adlc up <slug>` the runner builds the tool layer and installs `stack-<name>`; the egress proxy adds `<name>.txt`; and every agent loads the stack's skills that fit its task. Accepted ADRs in the project override any stack convention.

**Where it lives:** the runner installs stacks only from the ADLC checkout it runs from (`/opt/adlc`, the dev server's `~/adlc`). An organization's stacks therefore go into **the organization's fork of ADLC**, which its dev servers run. Keep that fork **private** when the conventions are internal (internal hostnames, registries, compliance rules); ADLC works from a private repository.

## Step 1: gather the conventions (ask before you write)

Don't invent conventions. Get them from the user, from the organization's documents, and from a reference repository the user points you to. Ask in rounds of at most 4 questions, each with a suggested answer drawn from what you've read, and stop asking once you have enough to write a useful first version (gaps become `tbd` notes in the skill, not guesses).

1. **Scope and name.** Which kind of application, and which part of it (API, web app, mobile app, worker, firmware)? Is there an exemplary repository to learn from? Name the stack `<org>-<kind>` in lowercase with hyphens (e.g. `acme-spring-api`); it becomes `stack-acme-spring-api`.
2. **Relation to existing stacks.** If an ADLC stack already covers the technology (`node-api`, `react-web`, `react-native`), decide with the user:
   - **standalone** (recommended when the organization's way differs in more than a few places): a complete stack; projects list only it. Copy what still applies from the existing stack and adapt it.
   - **overlay** (when only a few rules differ): a small stack that projects list *next to* the existing one (`stacks: [node-api, acme-node]`). Start every overlay skill with "Refines `stack-node-api:<skill>`. Where they differ, this skill applies." and write only the differences.
3. **Learn from the reference repository**, if there is one: read its layout, build files, dependency list, lint and format config, test setup, Dockerfiles, CI workflows and README. Write down what is a decision (a library chosen over others, a layout, a rule) and confirm the ambiguous ones with the user. Never copy secrets, internal tokens or customer data from it.
4. **The conventions,** one area at a time. Use this list; skip what doesn't apply:
   - **Layout:** repository and module structure, naming, where things go.
   - **Libraries and versions:** what is mandatory, what is forbidden, internal packages and where they come from (internal registries).
   - **Code:** API style and contracts, error handling, configuration and secrets, logging and tracing format, i18n, accessibility.
   - **Security and compliance:** authentication (company SSO?), authorization, data classification, PII handling, audit logging, dependency and licence policy.
   - **Data:** databases, migrations, schema rules, caching.
   - **Testing:** the test frameworks, what each level must cover, coverage or quality gates, how a test environment is built.
   - **Build and deployment:** Dockerfiles and base images, the registry, how and where it's deployed (Compose, Swarm, Kubernetes, PaaS), environments, health checks.
   - **Review:** what the organization's reviewers always check.
5. **Tools and network.** Which tools must exist on the dev server for the agents to build and test this application (JDK, Go, Python, an SDK, a CLI)? Which hosts do installs and builds download from (package registries, internal mirrors, SDK hosts)?
6. **Setup questions.** Is there anything a project of this kind must decide at `/adlc-core:init` (e.g. which internal platform team owns it, which cluster it deploys to)?

Summarise what you'll write (skills, templates, tool layer, domains) and get the user's agreement before writing files.

## Step 2: write the plugin

`plugins/stack-<name>/.claude-plugin/plugin.json`:

```json
{
  "name": "stack-<name>",
  "version": "0.1.0",
  "description": "ADLC stack pack: <kind of application> following <org>'s conventions: <the main areas covered>.",
  "author": { "name": "<org or team>" }
}
```

Split the skills by concern, so each agent loads only what its task needs. The usual split (one folder each under `skills/`):

| Skill | Holds | Loaded by |
|---|---|---|
| `<kind>` (e.g. `spring-api`) | layout, libraries, code rules, security, config, logging, testing approach, review checklist | architect, test-designer, implementer, reviewers, debugger |
| `<kind>-data` (if it has data) | databases, migrations, schema and caching rules | the same, for data work |
| `<kind>-containers` | Dockerfile, compose files, deployment manifests, health checks, image tags | the walking skeleton, CI/infra work |
| `<kind>-testing` or `<kind>-test-env` | test frameworks, the per-run test environment, `adlc.build.yaml`, e2e jobs | test-designer, build-runner, QA |

Each `SKILL.md`:

```markdown
---
name: spring-api
description: <Org>'s conventions for Spring Boot services. Covers layout, libraries, API contracts, errors, security, config, logging, testing and the review checklist. Load before designing, implementing, reviewing or debugging <org> Spring Boot service code.
---

# <Org> Spring Boot service conventions

These are defaults. Accepted ADRs override them. Check library APIs with Context7 before you use anything version-sensitive.

## Layout
…
## Review checklist
- …
```

Rules for the content:
- **The `description` decides when an agent loads the skill.** Say what it covers and end with "Load before designing, implementing, reviewing or debugging <what>".
- **Write decisions, not tutorials.** "Use `acme-logging` with the JSON layout; never log request bodies" is useful. Explaining how logging works is not.
- **Make every rule checkable**, so the reviewers can verify it: name the library, the path, the limit.
- **Mark what's mandatory** (security, compliance, the organization's MUSTs) versus a default the project may change with an ADR.
- **End with a review checklist**: the 5–15 things the organization's reviewers always check.
- **Keep each skill short**: the existing ones are 35–90 lines. Agents load several skills per task; long skills crowd out the code.
- **Leave out secrets and credentials.** Name secrets (`ACME_SSO_CLIENT_SECRET`) and say where they come from; never include values.
- **Mark unknowns as `tbd`** with who decides, instead of guessing.

## Step 3: templates for the walking skeleton

The first issue of every ADLC project is a walking skeleton (scaffold, CI, test environment, one thin end-to-end path). Templates make it follow the organization's way from the start. Put them in `skills/<skill>/templates/` and list them in the skill with what each becomes:

```markdown
| Template | Becomes | Purpose |
|---|---|---|
| `Dockerfile.api` | `apps/api/Dockerfile` | dev and prod targets on <org>'s base image |
```

The test environment and CI templates must follow ADLC's runner rules (see `plugins/stack-react-native/skills/rn-test-env/SKILL.md` and `plugins/adlc-core/skills/testing-contract/SKILL.md`):
- **`adlc.build.yaml`**: the commands the agents and CI run verbatim: `install`, `lint`, `typecheck`, `arch_check`, `build`, `test`, `test_file` (with `{package}` and `{file}`), optionally `test_affected` (with `{base}`); the `env` lifecycle (`up`, `seed`, `start_watch`, `start_build`, `down`); `deploy_files`; `testing.e2e.targets`. Start from `templates/project/adlc.build.yaml`.
- **Per-run test environments:** every compose project name contains `${ADLC_RUN}`; no published host ports (`ports:`); web-facing services join the network `adlc-web` with Traefik labels; bind mounts only under the project's folder; runtime services set `NO_PROXY: "*"`.
- **CI jobs** (an `e2e.yml` or additions to `ci.yml`): `runs-on: ${{ fromJSON(vars.ADLC_TEST_RUNS_ON || '"ubuntu-latest"') }}` so jobs run on ADLC's CI runners when the project has them; the gate step `bash .github/scripts/adlc-gate.sh` first; a `timeout-minutes` on every job; no secrets in pull-request jobs.

## Step 4: tools, network and setup questions (only if needed)

**Tools on the dev server**: `sandbox/runner/stacks/<name>.Dockerfile`. The base image has Node 22 with pnpm, git, gh, Claude Code, the Docker CLI with compose, jq, yq and tmux. Add only what the agents need to build and test:

```dockerfile
# <name> stack layer: <what it installs>.
ARG BASE=adlc/runner-base:local
FROM ${BASE}
LABEL org.adlc.managed="true"
USER root
RUN …install with pinned versions, clean package caches in the same layer…
USER adlc
```

Pin versions. Put environment variables the tools need in `/etc/profile.d/adlc-<name>.sh` (see `react-native.Dockerfile`).

**Network**: `sandbox/egress/domains/<name>.txt`, one host per line, `#` comments allowed; a leading dot covers subdomains (`.maven.acme.internal`). List only what installs and builds need beyond `core.txt`. It is enforced when a project sets `network.mode: allowlist`; `adlc audit <slug>` shows what a project actually reached.

**Setup questions**: `skills/<name>-setup/SKILL.md`, in the project-setup table format, which `/adlc-core:init` asks after its core sections:

```markdown
### <Name> setup
| key | question | default |
|---|---|---|
| acme.platform_team | Platform team that owns the service | `tbd` |
```

## Step 5: register and document it

1. Add the plugin to `.claude-plugin/marketplace.json` (`name`, `source: ./plugins/stack-<name>`, `description`).
2. Add the stack to the list of available stacks in `plugins/adlc-core/commands/init.md` and to the `stacks` comment in `templates/project/adlc.yaml`.
3. Add it to the tables in README §15 and to the Field Guide's Stacks section (`ui/web/public/guide/index.html`), as this repository's `CLAUDE.md` requires for every change.
4. Bump the plugin's `version` whenever its skills change later, so runners pick up the change on `adlc restart`.

## Step 6: check it

- `jq . plugins/stack-<name>/.claude-plugin/plugin.json .claude-plugin/marketplace.json` parses.
- Every `SKILL.md` has `name` and `description` in its front matter, and the `name` matches its folder.
- If you added a tool layer: `docker build --build-arg BASE=adlc/runner-base:local -f sandbox/runner/stacks/<name>.Dockerfile sandbox/runner` builds (on a machine where `adlc up` has built the base image).
- Read each skill once as the implementer would: could you write the code from it without asking? Then as the reviewer: could you check every rule?
- Tell the user how to try it: enable it in a test project's `adlc.yaml`, `adlc up <slug>`, check `docker logs adlc-<slug>-runner-1 2>&1 | grep "stack pack"`, then let the walking skeleton or a small issue run and review what the agents produced against the conventions.

Commit the stack as one change: plugin, marketplace entry, optional layer, domains and setup skill, and the docs.
