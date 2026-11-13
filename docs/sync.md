# Reverb — the Sync screen

> Sync's domain vocabulary and the data rules behind it: the parts that cannot be read off the
> code, and the decisions a change could quietly reintroduce a bug by reversing. **Read this
> before touching the screen or `syncManager`.** Its visual treatment follows the same rules as
> everything else — see `AGENTS.md` §5.
>
> It describes what _is_. Git is the history of how it got here.

The hardest screen, and the one with rules that cannot be read off the code.

**Workflows** are the artifact files a **connector** uploads when it runs. Which ones get uploaded is
declared in a **local YAML** on the tester's machine; the connector repo's **source YAML** is the
source of truth for which workflows exist and what version each is at. Both files carry the list at
the connector's deployment key path, each entry `{ zone, filePath, repeatable? }`.

**The version is encoded in the filename** (`…_2025_03_19` before the extension) and nothing else
records it. Filenames change constantly and differ per git branch, so a tester's local file goes stale
every time they switch branches. The screen scans the source, lets the tester pick which workflows
belong in their local YAML, and rewrites it with the newest filenames.

| Term            | Meaning                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow        | One deployment entry — an artifact file the connector uploads. Identified by its zone.                                                                          |
| Zone            | The unique key, **fully qualified** — `Bulk`, `QC Audit`, `QC Finalization`. Not a category; the string _is_ the identity. `QC` alone is never a zone.          |
| Source          | The connector repo's source YAML — read-only source of truth, contents change per git branch.                                                                   |
| Local YAML      | The tester's own file, in a hidden directory under `connectorRoot`. The only file this screen writes, and it holds unrelated connector config besides the list. |
| `connectorRoot` | Absolute path to the connector repo checkout on this machine. Labelled "base path" in the UI.                                                                   |
| Profile         | A saved, named **set of zones** — scoped to what is being tested (QC / Full / Finalization), not to a customer.                                                 |
| Version         | The `_YYYY_MM_DD` suffix in the filename, optionally followed by `_N` for a same-day revision. Parsed into separate `version` / `revision` fields.              |

## Correctness rules

1. **Never write the source YAML.** Read-only, always.
2. **Preserve the target's comments, ordering and formatting.** The tester's local YAML contains
   unrelated connector config, and a naive parse → serialize round-trip destroys it. This is the single
   biggest failure mode and the reason for the YAML library choice below, whose one deliberate exception is
   the forced block style.
3. **Re-scan source on route entry and on manual reload.** The file changes behind the app's back on
   every branch switch. The scan always re-runs, but it only re-seeds the selection from the local YAML
   when nothing is staged (rule 8).
4. **Compose paths with forward slashes.** Reverb ships on Windows too, and `path.join` would emit
   backslashes and corrupt a POSIX-style YAML. Join with `/` explicitly and normalise the base path's
   trailing slash. `path` is still fine for _parsing_ a basename or dirname.
5. **Version parse degrades.** Never let an unparseable date mean "current" — the up-to-date check is
   the composed path, so versions are display-only and a name that doesn't parse costs nothing but a
   blank cell.
6. **Orphans are expected, not errors.** A zone in the target that is absent from source is the normal
   result of a branch switch. Surface it and let the tester remove it; never auto-remove, never crash.
7. **Write atomically** — temp file plus rename — **and take a rotating timestamped backup alongside**. The local YAML sits inside the connector checkout but is gitignored, so git cannot restore it
   and the backup is the only undo that exists.
8. **Nothing is written until Apply.** Selection is session state until then.
9. **Sync never creates the local YAML.** The apply path reads the target before writing and errors if
   it isn't there; an unset path is an error state whose copy says the file must already exist.

## Decisions that must not be reversed

- **The join key is `zone`, matched exactly.** Never key on filename — it changes every version.
- **Local path = `connectorRoot` + the source's repo-relative `filePath`.** Deriving it from source
  alone is what lets a workflow be added with no extra input.
- **The up-to-date test is the whole composed path, not the filename.** Any entry that doesn't match the
  derivation is stale — a bump, a moved checkout, or both. A filename-only test reports `current` for
  every zone after the tester moves their checkout. This keeps `outOfDate` ⟺ "Apply will rewrite this
  row".
- **Grouping is display only** — shallowest shared directory prefix per root, then the next segment.
  Never persisted, never written; zone strings are flat and can't be grouped reliably. Measured **per
  root** so a partial directory migration doesn't collapse every group.
- **`repeatable` is mirrored silently, never in the UI.** A new entry copies `repeatable: true` when
  source has it and **omits the key entirely otherwise** — writing `false` everywhere would churn the
  file. Its meaning belongs to the connector.
- **The screen works with no device connected.** The only screen not gated on ADB; don't gate its
  actions on `currentDeviceId`.
- **Ordering is not user-editable.** Writes preserve the target's existing order, so a reorder control
  would change nothing.
- **A profile seeds nothing.** The local YAML seeds the selection on every scan; the profile is a _label
  on the working set_, and `MODIFIED` says the two have drifted. Seeding from the profile on entry would
  greet the tester with a non-zero Apply badge after every branch switch.
- **`MODIFIED` compares the selection against the profile's zones intersected with the current scan.** A
  zone the scan doesn't carry can't be ticked, so counting it would leave a profile permanently
  modified. Missing zones surface as an `N missing` **count, not an error** — the zone comes back when
  the branch does.
- **The git branch readout parses `.git/HEAD` under `connectorRoot` directly**, with no dependency on a
  `git` binary. It falls back to the short SHA on a detached HEAD and **degrades silently** when
  `connectorRoot` isn't a checkout.
- **`connectorRoot`, never `projectPath`.** Reverb already owns "project" — the `.project.json` files
  under `saveLocation`. Two meanings in one `Config` would be a standing trap. `connectorRoot` is
  top-level, not sync-scoped: it is the base for composing local paths, the directory whose git branch
  the status bar reads, and the checkout the hidden local-YAML directory sits under.
- **The deployment key is config** (`sync.deploymentPath`, a dotted string normalised per segment on
  write), not a source constant, so the repository names no ecosystem's convention. A config someone
  deliberately emptied gets an error that names the key.
- **`sourceFile` and `targetFile` stay explicit paths, not derived** — the hidden directory and the file
  names vary, so both are picked with a file dialog.

## The YAML writer

`yaml` (eemeli) `^2.9.0` is the feature's only runtime dependency, chosen because
`parseDocument()` → mutate → `doc.toString()` **preserves comments and blank lines through edits**,
which is rule 2. The rejected alternative was `js-yaml` for reads plus a line-based rewrite for writes:
proven for _updates_, but every insertion and deletion would be hand-rolled against raw lines. **Do not
take `3.0.0-1`** — it is a prerelease on the `next` tag. **Main process only**: the renderer never
imports `yaml` and never sees raw YAML, only the computed diff over IPC.

**Collection style is forced to block on write.** `rewriteTarget` sets `flow = false` on the deployment
sequence **and on every entry map** before serialising, whenever the list is non-empty — the one place
the writer overrides rule 2, because the formatting being preserved was the writer's own damage.

- **How a file gets flattened.** An empty _block_ sequence has no representation in YAML, so removing
  every entry can only write `deployment: []`. Parsing that back sets `flow` on the sequence, and every
  entry appended afterwards inherits it.
- **Both levels have to be reset.** Clearing `flow` on the sequence alone still emits one flow map per
  entry, because the already-parsed maps carry their own flag.
- **It cannot churn a healthy file.** Forcing block on a file that is already block is byte-identical,
  so this only ever repairs.
- **The empty list stays `deployment: []` on one line.** The alternative, the key with nothing under it,
  parses back as **null rather than a sequence**, so the reader would report "has no list" against a file
  the app had just written itself. Hence the non-empty guard.
- **A no-op apply does not repair.** The apply path returns early on an empty plan, so a flattened file
  whose paths are all current stays flattened until something changes. Restoring the backup is the direct
  fix; writing a file the tester was just told needs no changes would be a worse surprise.

**The backup rotates, and its ordering is parsed, not lexicographic.** It is `<target>.<stamp>.bak`,
newest 5 kept. Both traps under it were found by driving a harness and are easy to reintroduce.

- **The stamp is UTC, second-resolution, colon-free** (`2026-07-28T14-32-05`) — readable rather than
  epoch millis, because this is a directory the tester browses, and colon-free because Windows won't take
  a colon in a filename.
- **A name sort orders same-second backups backwards.** `-` is 0x2D and `.` is 0x2E, so a sequenced name
  compares _below_ the unsuffixed one written before it, and the trim keeps the wrong five. Ordering
  parses the stamp and the sequence and compares them as a pair.
- **The sequence must climb, not fill gaps.** Trimming frees low sequences, so a gap-filling allocator
  reclaims one, sorts it as that second's _oldest_, and its own trim deletes it — meaning once the cap
  fills inside one second, the newest state stops being backed up at all. The sequence is
  `max(existing for this stamp) + 1`.
- **The depth is a constant, not config.** The cap exists so backups can't pile up in someone's checkout;
  a knob would only let that be undone.

## Sync's own UI notes

- **No dock and no drag handles.** Nothing on this screen talks to a device, and writes preserve the
  target's order, so neither has anything to do. The width isn't reserved, so the list runs rail-to-edge
  and the filename column gets it.
- **First run takes the screen** — four fields centered in the content region with the shell drawn
  normally around it, using the modal field conventions without being a modal. Sync genuinely cannot
  proceed without them, which is what earns it; contrast the unconfigured target, where only running is
  off so only running is taken away.
- **Select-all is a bordered chip at a fixed 76px, and it toggles** — `Select all` when the section is
  partial, `Clear all` when it's full, since a control that does nothing when everything is selected reads
  as broken. Fixed width because the label flips on every tick and a text-sized chip jitters the header's
  right edge.
- **Row accents are a 2px inset left rule plus a low tint, never a fully colour-coded row**: bumps
  `stale`, staged adds `mono-keyword`, staged removes `destructive` with the zone struck through.
- **`Work ad-hoc`, not `Clear selection`.** The latter reads as "untick everything", which would stage a
  removal of every entry in the local YAML from one menu click. The item detaches the profile and leaves
  the selection alone.
- **The apply preview is a grouped diff, not a row list** — bumps first (the common case), then adds, then
  removes — and **focus opens on Cancel**, because this is the one destructive moment and Enter must not
  write a diff the tester hasn't read. It names the backup **depth** rather than a filename, because the
  name isn't known until the write.
