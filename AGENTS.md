# Reverb — Repository Guide

> How this app is built: what it does, the decisions behind its architecture, the conventions a
> change has to hold to, and the visual rules the UI follows. Written for anyone — contributor or
> coding agent — picking the repository up with no prior context.
>
> It describes what _is_. Git is the history of how it got here. Read the sections you are about
> to touch before changing anything; most rules here were paid for by a bug.

Three documents, and this is the one to read first:

| File              | What is in it                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`       | The app, how to work on it, the architecture, the conventions, and the design vocabulary every screen shares.            |
| `docs/screens.md` | Per-screen rules — the ones a change would otherwise break. **Read a screen's section before changing its UI.**          |
| `docs/sync.md`    | The Sync screen's domain vocabulary and data rules, which cannot be read off the code. **Read it before touching Sync.** |

## 1. The app

Reverb is an internal Electron desktop tool for managing, organizing and executing ADB command
workflows against Android test devices — in practice, smart glasses running a **target client**:
one specific Android app that Reverb drives but does not ship with.

**Nothing about that client is compiled in as a constant.** Its five identifying values — package
id, launcher activity, script-provider URI, and the barcode and speech intent actions — are the
`target` block in config, edited in Settings → Target. A config that has never been configured is
**seeded** with a working set (along with the provisioning routine and the sync deployment key) so
a fresh install drives a device without a Settings pass. Seeding is **block-level**: a target with
any field set is left alone rather than spliced with values from another client, because a mixed
target fires real commands at the wrong app and is the one unconfigured state that does not
announce itself. Every value that differs per machine — all six paths — is still empty by default.

The QA/testing team builds **projects** that group **commands** (barcode or speech intents run via
`am broadcast`) and **flows** (ordered command sequences with a configurable inter-command delay
and abort control). A **JS Console** runs one-off JavaScript against a connected device through the
target's script content provider (base64-encoded payload → `content://<authority>/execute`). A
**Sync** screen rewrites the local deployment YAML from the connector's source. The core loop: pick
a device → open a project → send a command / run a flow / execute JS → read the result.

No accounts, no server — everything is local files and bundled ADB binaries.

## 2. Working on it

```bash
npm ci             # install
npm run dev        # run from source
npm start          # run the built app
npm run build      # typecheck + electron-vite build
npm test           # vitest — 96 tests across 16 files
npm run lint       # checks, never writes
npm run lint:fix   # writes; autofix can change semantics, unlike formatting
npm run format     # prettier, repo-wide, a no-op on a clean tree
npm run typecheck  # node + web projects
```

**The Electron binary is not fetched by `npm install`.** Since Electron 42 it downloads on demand,
but electron-vite resolves the path eagerly and throws `Electron uninstall`, so `prestart` and
`predev` run `install-electron` (idempotent, about a second once present). Packaging is unaffected —
electron-builder fetches its own copy.

### Verifying a change

- **Drive the built app rather than reasoning about the diff.** Several bugs have shipped that
  typechecked cleanly, read sensibly as markup, and were obvious in a screenshot — most of them a
  machine value set in the proportional font next to the same kind of value in mono, or an icon on
  one menu item ragging a column.
- **A test launch must use `--user-data-dir` pointed at a throwaway directory.** The single-instance
  lock is keyed on userData, so launching against a running Reverb quits before logging anything,
  which reads exactly like a broken startup. It also keeps a test's target values out of your own
  `config.json`.
- **Never pipe a launch through `head`**, or any consumer that exits early. Closing the pipe is what
  triggers the EPIPE path; redirect to a file instead.
- **Some defects only exist at a data scale your machine does not have.** Drive long lists and large
  libraries against a seeded throwaway project, not the two-flow one you happen to have open.
- **Substitute `child_process` rather than faking an adb binary.** Node refuses to spawn a
  `.cmd`/`.bat` without `shell: true` on Windows, so a batch-file fake behind `adbPath` is not
  reachable from `spawn` at all — and substituting at the same seam is what makes a step that never
  exits, or a spawn that fails outright, drivable on demand.
- **Winston's File transport flushes on a later tick**, so a harness asserting on log contents has
  to wait for it.
- Playwright's `_electron` drives the built app for UI verification; install `playwright-core` in a
  scratch directory, never in this repository. **Stub at the IPC boundary in main** —
  `contextBridge` properties are non-configurable, so a renderer-side stub of `window.<x>API`
  throws, silently fails, and lets the real handler run. Scenarios that mutate `config.json` mutate
  each other; start each from a pristine copy.
- **An empty `ls` of a TCC-protected directory is not evidence of an empty directory.** On macOS
  that covers `~/.Trash` and `~/Library` — verify from inside Electron instead.
- **Report what actually happened.** If a step was skipped or a check was not run, say so.

## 3. Architecture

A change that deviates from any of these is a decision, not an implementation detail: say so in the
commit message and edit this file in the same commit.

### 3.1 Framework and structure

Electron 43 + React 18 + TypeScript 5.5 — three-process split (main / preload / renderer) with
`contextBridge` isolation.

- `src/main` — managers, logger, crash handler, types
- `src/preload` — eleven `exposeInMainWorld` APIs (`projectAPI`, `adbAPI`, `barcodeAPI`,
  `screenPermissionAPI`, `regionSelectorAPI`, `provisionAPI`, `configAPI`, `dialogAPI`, `syncAPI`,
  `loggerAPI`, `jsAPI`)
- `src/renderer/src` — pages/dashboard → components + tabs + contexts
- Path aliases: `@/`, `@main/`, `@preload/`, `@components/`, `@pages/`

Shared main/renderer types are barrel-exported from `src/main/types/index.ts`, re-exported by
`src/renderer/src/types/index.ts`.

### 3.2 Routing

react-router-dom v7 using `MemoryRouter`. A persistent shell **layout route** wraps **every** screen
as sibling routes — Commands `/`, Flows `/flows`, Console `/console`, Sync `/sync`, Settings
`/settings`. The layout owns shared state (project, config, handlers, modals); screens read it via
`useOutletContext`. The nav rail switches routes through `useNavigationLock().safeNavigate`.

**Every screen is a route, deliberately.** The three main screens were once a `Tabs` component
driven by an `activeTab` string while Settings was already a route, which left two parallel
navigation mechanisms. The cost of unifying them is that **routed screens unmount on navigation**,
where the old Console tab was force-mounted with `display: none` specifically so a tester's JS
results survived switching away. That is why Console state lives in a context above the routes, and
why anything else that must survive navigation needs the same treatment or one of the two session
hooks (§5.5).

### 3.3 Styling

Tailwind 3 + shadcn/ui (new-york style, zinc base, CSS variables), dark mode default (class
strategy); icons via lucide-react + react-icons. The visual rules are §5.

### 3.4 State

React local `useState` centralized in `Dashboard.tsx` plus Context API for cross-screen state
(`FlowContext`, `ConsoleProvider`, `DeviceProvider`, `SyncProvider`). No global store.

### 3.5 Main process

No backend. Managers under `src/main/managers/`:

`adbManager` · `adbBroadcast` · `configManager` · `projectManager` · `dialogManager` · `jsManager` ·
`syncManager` · `backupManager` · `provisionManager` · `barcodeScanner` · `screenBarcodeScanner` ·
`regionBarcodeScanner` · `macScreenshotCapture` · `screenPermissionManager` · `workflowTracker` ·
`scrcpyManager`

ADB runs through `child_process` against binaries bundled in `extraResources/` (`adbWin`, `adbMac`).
IPC uses namespaced handlers — `project:*`, `adb:*`, `config:*`, `js:*`, `dialog:*`, `logger:*`,
`sync:*`, `provision:*`, `barcode:*`, `screenPermission:*`, `scrcpy:*` — all `invoke`/`handle`
except the push channels `provision:progress`, `adb:workflowState`, `scrcpy:state` and
`scrcpy:packet`, and the fire-and-forget `send`/`on` mirror input channels `scrcpy:touch`,
`scrcpy:scroll`, `scrcpy:key` and `scrcpy:nav`.

**The status bar's `<workflow>: <step>` is read from `adb logcat --pid` of the target package**
(`workflowTracker`), parsed per line as it arrives. The client pid is re-checked with `pidof` every
3s — while attached, to catch a restart, and while missing, to attach once it appears.

**Command payloads are passed as argv arrays, never interpolated into a shell string.** A scanned or
typed value can contain quotes, backslashes and shell metacharacters, and it has to reach
`am broadcast --es data` exactly as entered. `adbBroadcast` and `provisionManager` both spawn with an
args array; the command logger records the action and the payload length, never the payload.

**Exit codes are not trusted on their own.** `pm clear` prints `Failed` and exits 0, and the `pm`/`am`
family is not alone in it. Each step checks its output as well as its status, with failure lines
anchored at the start of a line so a legitimate line containing the word "error" passes. adb writes
its `* daemon not running` chatter to **stderr**, so "any stderr is a failure" would fail the first
step of every session.

### 3.6 Persistence

JSON files on disk. Projects live at `{projectsDir}/{id}.project.json` (atomic write plus schema
validation/migration via `projectManager`); config at `userData/config.json`, written through a
file lock plus a write queue and an atomic rename by `configManager`.

- **Config is only ever changed by a mutator run inside the lock** (`runUpdate`): read, mutate,
  validate and write are one atomic step. `config:save` merges a partial rather than replacing, and a
  write that changes nothing is skipped.
- **The renderer's copy of config is a read-through cache, never a write source.** No screen sends a
  whole `Config`.
- Each changing write archives the previous file to `userData/config-snapshots/` (restorable;
  `maxSnapshots`, default 5).
- **`validateAndFillConfig` rebuilds objects from a field whitelist rather than passing them
  through**, so a new field not registered there is silently dropped on the next read _and_ every
  write. Register new fields in the validator and in `Config`.
- **Seeding client defaults is a read-path step, not a validation step** (`seedClientDefaults`,
  applied on the way out of `readConfigUnlocked` and over `defaultConfig`). Validation also runs on
  the write path, so seeding there would re-fill a block in the same breath as the user emptying it.
  Repairs that _are_ legal in validation are the ones a user can never have chosen and that are
  idempotent — deduping the recents list, for instance.

### 3.7 Instancing

**One instance, one window.** `src/main/index.ts` takes `app.requestSingleInstanceLock()` before
anything else; the copy that loses it calls `app.quit()` immediately — before it reads config or
creates a window — and the copy that holds it answers `second-instance` by restoring, showing and
focusing the window it already has. `app.whenReady()` lives inside that guard.

This is a **product constraint, not a safety fix**: `config.json` was never at risk (the PID lockfile
makes a second process block rather than race), but two windows would fight over one device selection
and one `dockCollapsed` flag, and the copy that loses Chromium's cache locks floods the log with
errors it can never win.

### 3.8 Failure handling

**An uncaught throw in main shows one dialog, then leaves.** `crashHandler.ts` installs
`process.on('uncaughtException')` as the first statement in `src/main/index.ts` — without it
Electron's built-in handler runs, and that one shows an error box that **does not quit**, so anything
throwing repeatedly re-arms it forever with nothing rendered.

- **Benign stream write failures** (`EPIPE`, `ERR_STREAM_DESTROYED`, `ERR_STREAM_WRITE_AFTER_END`)
  are logged and swallowed — classified by error code, not by stream, since an I/O partner leaving is
  not a reason to end a session.
- **The benign branch silences the Console transport before it logs, and reports each code once.**
  The handler's own report would otherwise go back out through the stream that just failed and raise
  the next failure — a loop that wrote 282 MB in 10 seconds. Silencing removes the source rather than
  the report, and it is safe unconditionally because nothing in main writes to a child's stdin, so a
  benign write failure here is a stdout failure. Repeats of a seen code drop to `debug`, below the
  default level.
- **Everything else** logs its stack and shows one Restart/Quit dialog behind a re-entry guard,
  degrading to `showErrorBox` + exit before `ready`. Restart is `app.relaunch()` then `app.exit(0)`;
  `exit` rather than `quit` is safe because the config lockfile is PID-checked and self-clears.
- **`unhandledRejection` logs only and never dialogs** — Electron sets Node's mode to
  `warn-with-error-code`, so a rejection never crashes and never reaches the exception path.

### 3.9 Barcode capture

Screenshots stay in the main process and only decoded metadata crosses preload. Formats are
deliberately narrow: Data Matrix ECC 200 and QR Code. The decoder is `zxing-wasm` with its WASM
binary packaged rather than fetched.

- **Windows** uses Electron capture and the frozen overlay selector (`regionSelector.tsx`).
- **macOS** invokes absolute `/usr/sbin/screencapture` with argv arrays — `-x -i` for native region
  selection, `-x -D <number>` per display for quick scans. An absent output file means the user
  cancelled, which is distinct from a command failure.
- macOS PNGs live in a private mode-0700 `reverb-screencapture-*` directory under the resolved OS
  temp root, are unlinked after reading, and the directory is removed in `finally` on every path. A
  bounded startup and pre-scan sweep touches only verified owned child directories and rejects
  traversal, symlinks and active directories.
- No screenshot or decoded value is written to disk beyond that, logged, or sent anywhere.

**Screen Recording on macOS is bundle-scoped, and ad-hoc builds change identity.** Every changed
ad-hoc build has a new designated requirement, so macOS can keep an enabled row for the previous
build while the current one is denied. `screenPermissionManager` hashes the packaged designated
requirement from `/usr/bin/codesign`, stores it in a machine-local file outside config and backups,
and offers a scoped repair that invokes only `/usr/bin/tccutil reset ScreenCapture com.sknow.reverb` —
never the global reset, never from a shell, never silently at startup.

### 3.10 Build and packaging

vite 7 + electron-vite 5 + electron-builder 26; CI runs Node 24. appId `com.sknow.reverb`; the
Windows installer is `reverb-<version>-setup.exe`. Windows NSIS builds locally; CI and releases build
the macOS DMG with the hardened runtime.

- **CI ad-hoc signs every macOS artifact** with explicit identity `-`, then fails unless
  `codesign --verify --deep --strict` passes and the packaged identity is `com.sknow.reverb`. This
  gives one installed artifact a coherent TCC identity without an Apple account, but a different
  build may need Screen Recording granted again.
- **The `build` field in `package.json` is the only packaging config.** A package key
  short-circuits electron-builder's config resolution, so a sibling `electron-builder.yml` would
  never be read. Do not add one.
- **`files` is what keeps the repository out of the installer.** Without it the default `**/*` ships
  `src/`, the tsconfigs and every gitignored directory inside the asar, plus a second 22 MB copy of
  `extraResources/`. Two directories must stay in: `out/` is the app, and `resources/` is read at
  runtime for the window icon (also `asarUnpack`ed so it has a real path). `extraResources/` is
  excluded from the asar but still copied beside it — `adbUtils` only ever resolves adb under
  `process.resourcesPath`.
- **Packaging never publishes**: every `build:*` script passes `--publish never` and the
  tag-triggered workflows pass no `GH_TOKEN` to the build step, so a workflow's own release step is
  the only thing that creates a release.
- **Auto-updating is not implemented.** `latest.yml` is still generated locally, so wiring an updater
  later means uploading that artifact, not removing the flag.
- **The renderer's build target is a fallback, not a match.** electron-vite maps an Electron major to
  a Chromium target and its table stops at Electron 39, so on Electron 43 it falls back to the newest
  entry it knows (`chrome142`). Correct in practice, but a guess until that map covers the Electron
  actually in use.
- Only `build-check.yml` runs on push and PR (`npm ci` + `npm run build` on macos-latest). It builds
  but never launches, so installed-app behaviour, Screen Recording and native selection still need a
  driven packaged-Mac pass. The other workflows are tag- or dispatch-triggered, so edits to them ship
  unverified until a release is cut.

## 4. Conventions

### 4.1 Source comments — read this first

**This outranks any generic guidance asking for thorough or comprehensive comments.**

- **One or two physical lines.** No exceptions, including for a genuinely interesting reason — the
  long version belongs in the commit message.
- **Comment only a non-obvious constraint, failure mode, security boundary, or public contract.** If
  the code already says it, delete the comment.
- **Prefer clear names and types over narration.** Tests explain their examples through their names.
- No section banners, implementation walkthroughs, or paragraph-length doc comments.
- **Never cite a document, a section number, a ticket or a decision id.** State the constraint
  instead of pointing at where it was decided.

Four ways a comment fails even at one line. Each of these has actually shipped and been caught in
review:

- **Naming UI that does not exist.** _"Pinning is the star's job"_ — there is no star; pinning is in
  the row's overflow menu, and a star was explicitly rejected. A reader goes hunting for it. **A
  comment naming a control is a claim; check it.**
- **Narrating instead of constraining.** _"Wait for the lock holder"_ on a spin loop says what the
  line does. _"Synchronous callers cannot await, so the retry delay has to spin"_ says why it is
  written that way at all.
- **Describing one machine's setup.** _"The usual device library shape"_ describes one developer's
  devices, not a property of the code.
- **Restating the signature.** A comment that repeats the function name in a sentence is worse than
  no comment, because it has to be maintained.

**Before finishing a change**, read every comment you added or edited and ask, in order: is it two
lines or fewer; does it state a constraint rather than a description; is every name and behaviour in
it still true; and would it read as ordinary engineering to someone who has never seen this change.
Cut or shorten anything that fails.

### 4.2 This file

The same discipline applies here. **Git is the build history** — this document records what _is_,
not how it came to be.

- Update it in the same commit as the work that changed it.
- **Add a line, don't append a retrospective.** Verification counts, assertion tallies, timings and
  "found on the way" belong in the commit message.
- **If a rule changed, edit the rule.** Don't leave the old one standing with a correction beneath
  it — a document that argues with itself is worse than one that is briefly wrong.
- **Delete what is no longer true.** Nothing is lost; it is in git.
- Names, numbers and file paths here are claims. Check them against the code before writing them
  down, and again when you edit nearby.

### 4.3 Formatting, linting, naming

- **Formatting** — Prettier: single quotes, no semicolons, 100-character width, 2-space indent, LF,
  no trailing commas; prose is never rewrapped. `npm run format` is repo-wide and a no-op on a clean
  tree, so it is safe to run mid-feature. Nothing is prettier-ignored.
- **Linting** — ESLint 9 flat config (`eslint.config.mjs`): `@electron-toolkit/eslint-config-ts` +
  React + `react-hooks` + the toolkit's prettier config last, which also runs Prettier as an ESLint
  rule. It exits **0**, carrying warnings rather than errors for deferred debt: `no-explicit-any` and
  every `react-hooks` rule are `warn`, and `explicit-function-return-type` is off as style. **A new
  error therefore means new breakage.**
- **Naming** — components `PascalCase.tsx`; utilities and managers `camelCase.ts`; handlers
  `handle{Action}`; managers `{entity}Manager.ts`; domain types bare `PascalCase` (`AdbCommand`,
  `Flow`, `Project`, `Config`); props `{Component}Props`.
- **Markdown caution.** Prettier reformats more than the lines you touched. Keep any literal on a
  single line, outside emphasis, and never at the start of a wrapped line, and run
  `npx prettier --check <file>` after _each_ edit rather than once at the end. The dangerous case: a
  body indented to 8 spaces inside a numbered item becomes an indented code block and then
  round-trips byte-identically, so `--check` reports the file clean forever. After `npm run format`,
  read the diff for re-indentation, not just for your own lines.

### 4.4 Logging

Winston, main process only. **Not** daily rotation: one timestamped file per launch
(`logs/app-<ts>.log`), swept by `logger.ts` itself on a fixed 24h timer. Retention is both an age cap
and a file-count cap (`logging.maxAgeDays` / `maxFiles`, defaults 7 and 10), and the level is
configurable — pushed in via `applyLoggingConfig` at startup and after every config write.

- **The Console transport is `silent` in a packaged build.** Nothing reads stdout there, so every
  line written to it can raise `EPIPE` and nothing can be read back. `silent` rather than a dropped
  transport, so `applyLoggingConfig` still has both to set a level on. In a dev build it starts live
  and can be silenced at runtime by `silenceConsoleTransport()`; that is one-way and session-scoped,
  and `applyLoggingConfig` only ever sets `level`, so a config write cannot switch stdout back on
  mid-session.
- **Main uses the logger for everything and `console.*` for nothing** — the crash dialog names the
  log directory, so a diagnostic reaching only stdout points the user at a file that never mentions
  it. The renderer uses `console.*` directly.

### 4.5 Testing

Vitest. `npm test` is 96 tests across 16 files, covering the barcode decoder and its Windows/macOS
capture seams, the safe ADB argv boundary, region-selection geometry, the screen-permission manager,
the preload boundary, `configManager`'s recents transform, and the dock's pinned ordering.

## 5. Design system

The visual tone is **sharp, dense, technical — a dark zinc developer tool**. Dark mode is the
default and the only theme; there is no light variant.

### 5.1 Foundations

- **Color** — shadcn/ui new-york, **zinc** base, CSS custom properties in `base.css`.
  `--background` ≈ `#09090b` (dominant surface) · `--card` / `bg-muted/30` (secondary surfaces) ·
  `--primary` ≈ `#4B4E6D` (accent) · `--destructive` `hsl(0 62.8% 30.6%)` (errors only) ·
  `--foreground` ≈ `#FCF8F8` (text) · `--muted-foreground` (placeholders, timestamps, empty states).
- **Type** — a two-face system. **Inter** for chrome (bundled woff2 at
  `src/renderer/src/assets/fonts/`, weights 400/500/700), used at **400 / 600**; **JetBrains Mono**
  for machine values (bundled via `@fontsource-variable/jetbrains-mono`, imported in `main.tsx`).
  Roles: Body 14px/400, Label 12px/400, Heading 16px/600, Code 13px `font-mono`.
  - **Ligatures** — JetBrains Mono ships programming ligatures on. They are enabled **only on code
    surfaces** (the Console editor and its highlighted results) via a `code-ligatures` marker class,
    and off everywhere else: a keyword or command value in a table cell has to render literally,
    character for character, because it gets copied and compared verbatim.
  - **Font paths are relative to `base.css`** (`./fonts/…`). Getting this right is also what lets
    Vite fingerprint and emit the files instead of passing the URL through untouched.
  - **Vite inlines assets under 4 KiB as `data:` URIs, which the renderer's CSP
    (`default-src 'self'`, no `font-src`) refuses** — `electron.vite.config.ts` opts fonts out of
    inlining rather than widening the policy.
  - **Tailwind tree-shakes class selectors inside `@layer` against the `content` globs**, so rules
    targeting runtime-generated classes get silently stripped.
- **Spacing & radius** — 4px base scale (multiples of 4 only): xs 4 · sm 8 · md 16 · lg 24 · xl 32.
  Global scrollbar width **10px** — anything narrower is under a usable pointer target, which makes
  dragging the bar not a real way to move a long list.
- **Radius** — controls `9–10px`, cards/panels `12px`, badges `5–6px`, type dots `2px` (square).
  **Labels** — 11px uppercase, `tracking` ≈ `0.06em`, `text-glyph-dim`.

Tokens are encoded in `tailwind.config.js` + `base.css`; this section stays the source of truth.

### 5.2 Surface and accent tokens

Defined in `base.css` as **bare HSL channels** (so Tailwind's `/opacity` modifier works) and wired to
named utilities in `tailwind.config.js` 1:1 with the variable name (`--surface-panel` →
`bg-surface-panel`, `text-surface-panel`, …). **Prefer these tokens over raw hex downstream;** fall
back to a literal only where no token exists (mostly one-off box-shadows).

| Token / utility        | Hex       | Use                                                                     |
| ---------------------- | --------- | ----------------------------------------------------------------------- |
| `surface-shell`        | `#0a0a0c` | window background (a touch cooler than `card`)                          |
| `surface-chrome`       | `#08080a` | recessed chrome: nav rail, dock, status bar                             |
| `surface-panel`        | `#0c0c0e` | list containers, result cards, flow cards                               |
| `surface-control`      | `#131316` | device pill, command bar, dock rows, modal inputs                       |
| `surface-editor`       | `#0e0e12` | console editor frame, modal background                                  |
| `hairline`             | `#1c1c20` | dividers inside panels, chrome region borders                           |
| `border-control`       | `#26262b` | control borders (pills, inputs, buttons) — `border-border-control`      |
| `border-bar`           | `#2b2b33` | command-bar / console-editor frame border                               |
| `nav-active`           | `#1d1d2e` | selected nav-rail item, active filter chip, segmented toggle            |
| `row-hover`            | `#101014` | table row hover / selected                                              |
| `accent-indigo`        | `#7c7fa6` | active rail glyph + 3px indicator, `⇄` markers                          |
| `accent-indigo-bright` | `#c7d2fe` | active rail label text                                                  |
| `mono-keyword`         | `#a5b4fc` | keyword column, `›` command prompt                                      |
| `success`              | `#34d399` | run glyph, success (hover), flow-progress; row tint via `bg-success/5`  |
| `success-muted`        | `#059669` | success idle                                                            |
| `status-connected`     | `#10b981` | device-connected status dot                                             |
| `type-barcode`         | `#38bdf8` | barcode type dot / label                                                |
| `type-speech`          | `#fbbf24` | speech type dot / label                                                 |
| `stale`                | `#f0883e` | out of date / needs attention: Sync row rule + tint, `NO FILE` badge    |
| `glyph-dim`            | `#7a7a85` | inactive icons, uppercase labels, table headers                         |
| `glyph-dimmer`         | `#6c6c75` | drag handles, breadcrumb `/`                                            |
| `text-dim`             | `#909098` | mono id fragment, timestamps, sub-captions, nav labels, status-bar text |

### 5.3 Shell surface map

`Shell` (`mainContainer.tsx`) composes `NavRail` + top-bar slot + routed content + dock slot +
`StatusBar`. It owns the aside _frame_ and width only — the dock owns everything inside it, so its
header can sit flush and line up with the top bar. `DOCKLESS_ROUTES` is `/sync` and `/settings`; it also hides the bottom mirror panel.

- **Nav rail** (62px, left) — `bg-surface-chrome`, right border `hairline`. 34×34 logo tile on top;
  42×42 item tiles (radius 11) with a 15px glyph and a 10px caption (full names as tooltips);
  Settings gear pinned bottom via a spacer. Active item: `bg-nav-active`, label
  `text-accent-indigo-bright`, glyph `text-accent-indigo`, plus a 3px×20px `accent-indigo` indicator
  (radius 2) at the rail's left edge.
- **Top bar** (56px, `h-14`) — bottom border `hairline`; screen title 15px/600, `/` breadcrumb in
  `glyph-dimmer`.
- **Global commands dock** (264px, right, collapsible to `w-11`) — `bg-surface-chrome`, left border
  `hairline`.
- **Status bar** (32px, bottom) — `bg-surface-chrome`, top border `hairline`, mono 11px `text-dim`.
- **Routed content** — `bg-surface-shell`; panels and cards `bg-surface-panel` + `hairline` borders,
  radius 12; table rows hover `bg-row-hover`.

### 5.4 Laws that cross every screen

These are the ones a change most often breaks.

- **`--primary` is reserved for the single primary action per screen plus the active nav
  indicator — nothing else.** Every violation of this reads as the app having two different ideas of
  what matters. Settings has **no** primary action at all, because every edit there saves on the
  spot.
- **The sans/mono split is semantic, not decorative.** Sans = a human label (screen titles, command
  names, descriptions, buttons, empty states). Mono = a literal machine value you would copy or
  compare (keywords, values, timestamps, device ids, counts, step/delay numbers, table headers, nav
  captions, the status bar, every code surface). That contrast is what makes the tool read as
  technical — **don't reach for mono as decoration**, or the signal flattens and stops meaning
  anything.
- **The three dim roles are a calibrated hierarchy:** `glyph-dimmer` < `glyph-dim` < `text-dim` <
  `muted-foreground`, landing around 4.3:1 for labels and 5.9:1 for captions on `surface-panel`.
  Prefer these roles over inventing new dim greys; if something reads too faint, **adjust the token,
  not the call site** — that fixes every screen at once.
- **`stale` is a _state_ token, not a hue.** It means "out of date / needs attention", never failure.
  An out-of-date row gets a 2px inset left rule plus a ~4.5% tint rather than colour-coding the whole
  row.
- **A border means it's pressable.** Real controls carry `border-hairline` or `border-border-control`;
  **status badges carry none**, or they read as buttons you can't press. The row's own inset rule
  carries the emphasis instead.
- **One shared CSS grid language, not the `<Table>` primitive.** The Commands list defines it —
  `GRID = 26px 96px 190px 130px 1fr 160px 124px` = drag · Type · Name · Keyword · Value ·
  Description · actions — and Flows, Sync and Settings reuse the same header, row metrics, type dot,
  column colours, truncation and 28px icon buttons with their own widths.
- **Row actions are 28px icon buttons (16px glyphs), visible at rest**, `text-muted-foreground` base
  with a per-action hover tint. Quiet reveal-on-hover glyphs read too faintly at this size.
  **Destructive stays last** as a cluster grows, and run stays at the outer edge.
- **A missing control at the edge of a cluster reads as spacing; a hole in the middle reads as a
  bug.** Where a control cannot apply to a row (barcode rescan on a speech command), render a 28px
  spacer at the cluster's outer edge rather than a disabled button or nothing.
- **One scroller per screen.** Scroll chaining only reaches the parent _after_ the inner box hits its
  boundary, and Chromium then **latches** the gesture to that box, so a wheel over a capped card
  never moves the page. `overscroll-behavior` only _blocks_ chaining, so there is no CSS opt-out —
  the fix is structural. dnd-kit compounds it: its auto-scroller drives the nearest scrollable
  ancestor of the element under the pointer.
- **Inline feedback over global.** Copy and run swap their icon to a `Check` for ~600–1500ms when the
  target is spatially close; toasts are reserved for genuinely global notifications. Loading is
  `Loader2` + `animate-spin` with `aria-busy="true"` on the acting button, and re-entry disabled
  while running. Empty states are quiet, centered `muted-foreground` copy.
- **Session-only destructive actions** (Clear results) need no confirmation; only persistent data
  loss does. Every delete routes through `confirmModal.tsx` — destructive primary, **focus on
  Cancel**, and body copy naming _why it's safe_ or what cannot be undone.

**Everything else is per screen, and it lives in `docs/screens.md`.** Read the section for the
screen you are about to change: the laws above are the floor, not the whole rulebook, and most of
what is written there exists because the obvious shape was tried first and was wrong.

### 5.5 View state

**View state survives navigation, not relaunch.** Every screen is a child of the layout route, so
leaving one unmounts it. Two peer hooks in `lib/hooks/` keep what would otherwise die there:
`use-scroll-memory.ts` holds each scroller's offset behind a callback ref, and `use-session-state.ts`
is a `useState` that outlives unmount, holding flow collapse, the Commands type filter, Settings
section state and the dock's pinned-collapse default.

- **They must have the same lifetime and the same key granularity — one offset per screen, so one
  collapse set per screen.** Otherwise a position measured in a 1035px collapsed list is restored into
  the 7719px expanded one: the restore works, and what it points at has moved. **Anything that changes
  scroll height needs at least the lifetime of the scroll offset.**
- Neither survives a relaunch. A stored offset, or a collapse set naming flows that have since been
  deleted, describes content that no longer exists.
- `use-session-state.ts` writes its store **from an effect, not from inside the setter**, so the updater
  stays pure and what outlives the component is always the value it last rendered.
- **A project switch is the one gesture that clears part of it.** Switching, creating, duplicating or
  deleting a project refetches and sets state — it must never `window.location.reload()`, which gives
  every one of those Maps a lifetime of zero. It **clears deliberately** what is keyed to the outgoing
  project's document: the Commands and Flows offsets, the flow collapse set, and the Commands type
  filter. Everything a project does not scope survives: Console results and history, the device list and
  selection, Settings section state, and Sync's.
- **The first click on an unfocused window acts** (macOS) — `acceptFirstMouse: true` on the
  `BrowserWindow`. Constructor-only in Electron, so it is a build-time behaviour with no setting behind
  it.
