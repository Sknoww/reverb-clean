# Reverb — per-screen rules

> The rules each screen's implementation depends on: the ones a change would otherwise break, and
> the reasons a shape that looks arbitrary is not. **Read the section for the screen you are about
> to change.** The vocabulary it assumes — surface and accent tokens, the type roles, the shared
> CSS grid, the laws that cross every screen — is in `AGENTS.md` §5.
>
> It describes what _is_. Git is the history of how it got here.

## Commands

`commandBar.tsx` · `commandTable.tsx`, orchestrated by `commandTab.tsx`: a command bar, filter
chips, and one unified sortable list rather than two tables.

- The bar is `h-[46px]` `bg-surface-control` with a `›` prompt in `accent-indigo`; its `<input>` is
  transparent and carries `.bare-input` so the **container** shows focus instead of the global input
  ring. Trailing cluster: two type chips (Barcode / Speech), a divider, a bordered `＋ Save`, then
  `▶ Run`. The active type chip fills with its own accent so the selected run-type is unmistakable.
- **`▶ Run` is the screen's single `--primary` action, and it disables on an empty bar** — that is
  what makes it teach, because the button is lit by what you typed. Its `title` carries
  `or press Enter` so the keyboard path stays discoverable. **Not `success` green**: row runs are
  `success` and mean _run this saved command_; the bar runs what you just typed.
- Enter runs the value as the selected type, or runs a matching command if the value equals an
  existing keyword. ⌘K / Ctrl-K focuses the bar; `COMMAND_BAR_KEY` in `constants/shortcuts.ts` is
  what the placeholder reads, so the modifier follows the platform.
- **The filter is session-scoped; the bar's type is not.** The filter decides the list's height, so
  it has to have the scroll offset's lifetime (view state, in `AGENTS.md` §5.5). The bar's type decides nothing on screen — it
  is an input mode, and resets to `barcode` on every visit.
- **Reorder persists.** With a type filter active, the reordered subset is spliced back into the full
  list, leaving filtered-out commands in their original slots.
- **No pinned row.** The dock provides cross-screen quick-run and every command runs inline from its
  row.

## Flows

`flowTab.tsx` · `flowCard.tsx` · `sortableCommandRow.tsx`: one scroll container, in `flowTab.tsx`. A
card is as tall as its steps.

- Card header: grip, name 15px/600, a bordered `N steps` pill, then quiet 28px edit / duplicate /
  delete. While running the card gains a 2px `border-l-success` accent and the header shows
  `● running · step X/Y`. Right cluster: the delay control (session-local; the persisted value is
  edited in the flow modal) then a **Run + Add segmented control**, Run flipping to a `destructive`
  `■ Stop` while running.
- `FLOW_GRID = 26px 30px 84px 150px 116px 1fr 130px 180px` adds a status column to the shared grid.
  **Per-row status is tracked by list _index_, not command id**, so it stays correct for legacy flow
  commands that predate the `id` field.
- **Cards collapse**, chevron plus name as one toggle — the name is the biggest target on the row,
  and a collapsed card has to be re-openable without hunting for a 28px glyph. State is
  session-local, keyed by flow id; cards open expanded.
- **The header is sticky**, card header _and_ column labels in **one** `sticky top-0 z-10` wrapper —
  two sticky elements would need the first's height as a `top` offset, and that height changes with
  the running indicator. Two consequences worth not reintroducing: the card must **not** have
  `overflow-hidden` (it would make the card the sticky header's containing block, pinning it to a box
  that never scrolls — clip corners on the wrapper and the body instead); and because the header is
  opaque so rows scroll under it, the drop-target tint there cannot be `bg-primary/5` — a translucent
  background-_color_ replaces the opaque one rather than layering, so `DROP_TINT` paints the same 5%
  as a flat gradient, which stacks.
- **`＋ New flow` lives in the list toolbar, not the top bar** — the top bar carries screen identity
  plus device-scoped actions, and this creates an object in the list directly below it. **The empty
  state carries its own copy**, since the toolbar is not rendered with zero flows.

## Global commands dock

`commandDock.tsx`. Rendered from the shell's `dock` slot on every route but `/sync` and `/settings`,
including Console: a console session is exactly where you want to reset the client or fire a barcode
between expressions.

- Header `h-14` aligning with the top bar, a mono count badge for the whole library, quiet `＋` and
  `»`. **No permanent sub-caption** — explanatory copy is onboarding, useful once and then noise
  above every row; it lives in the empty state instead.
- **Sortable id is `keyword`**, not `id` — common commands are keyed by keyword throughout the config
  plumbing, unlike project commands.
- **Row subcomponents are module-level**, not defined inside the parent; defining them per render
  remounts rows and drops flash and drag state.
- **Pinned commands are a view of one array.** `commonCommands` stays the single source of order and
  `splitPinned` in `lib/dockOrder.ts` derives the two blocks, so pinning never moves a command and a
  pinned set can be a **sequence**. A block reorders within the slots it already occupies; **a drag
  across the boundary is refused** — the row's `⋯` menu is the one way membership changes. The pinned
  block carries no header (a label would push down the rows the feature exists to make fastest), and
  with nothing pinned the dock is one flat list.
- **The collapse default is decided once per session, from the library as launched.** Deriving it on
  every render means pinning your first command instantly hides the other twenty.
- **Unpinning deletes the key rather than storing `false`**, so the in-memory and on-disk shapes are
  identical and the validator's output round-trips.

## Mirror panel

`mirrorPanel.tsx`, rendered from the shell's `mirror` slot under the routed content on every route but
`/sync` and `/settings`, collapsible like the dock (`mirrorCollapsed`, collapsed by default).

- **The stream is decoded in the renderer, not shown in a native window.** `scrcpyManager` drives
  the bundled `extraResources/scrcpy/scrcpy-server` through the `@yume-chan` packages over the adb
  server on 5037, and sends config and frame packets over `scrcpy:packet`; `use-mirror-stream.ts`
  decodes them with WebCodecs onto a canvas (`mirrorDecoder.ts`). Delivery goes to windows that
  called `scrcpy:subscribe`, not to whichever window started the session; subscribing replays state
  and resets the encoder. A dropped delta frame or a decoder error discards the decoder and waits for
  a keyframe. **The server jar and `AdbScrcpyOptions3_3_3` must stay on
  the same scrcpy version** — the server refuses a mismatched client.
- **The panel is hidden with CSS on dockless routes, never unmounted**: a fresh decoder has to wait for
  a keyframe the server only sends at start (the hook asks for one with `resetVideo` when it is missing).
- Start/Stop lives in the panel header, independent of collapse: collapsing hides the view but keeps the
  stream. State lives in main, so it survives navigation, and the server is killed on quit.
- **Controls are forwarded from the canvas**: pointer down/move/up, wheel and keyboard, plus Back and
  Home buttons that appear only while running. Keyboard input needs canvas focus, and Cmd-modified keys
  are never forwarded so app shortcuts keep working.

## Top bar

`topBar.tsx`: left is title · `/` breadcrumb; right is 34px peers at `gap-2.5` with **no primary**
except on `/sync`.

- **Route → title/breadcrumb is a small map in `topBar.tsx`; add a route there, not a conditional.**
  Commands and Flows get the project dropdown; **Console gets title only** (it targets the client's
  script provider, not the open project); Sync gets the profile switcher.
- **Device pill** (`deviceSelector.tsx`) — a 7px status dot, model name, an abbreviated id in mono,
  a 12px `▾`. The dot lives **inside** the trigger and refresh is folded **into** the dropdown, so the
  cluster is three controls rather than five. It is a `DropdownMenu`, not a `Select`, because the menu
  mixes value choices with an action; `Refresh devices` `preventDefault`s its select so the menu stays
  open. `shortDeviceId()` keeps the first two colon groups (`98:e7:1a` → `98:e7`) or truncates past 12
  chars, and is suppressed when the device has no model.
- **Reset client is outline, not filled** — `--primary` belongs to the one primary path per screen.

## Console

`consoleTab.tsx`, state in `ConsoleProvider` so results survive navigation.

- Framed editor, **132px min-height set on `.cm-scroller`, not `.cm-content`** (content min-height is
  overridden by CodeMirror's own layout and silently does nothing). CodeMirror runs with
  `theme="none"` so the wrapper's default dark theme cannot fight ours; all styling comes from a local
  `EditorView.theme` whose colors read the CSS custom properties.
- **Vertical padding belongs on `.cm-content` (`14px 0`) and horizontal on `.cm-line` (`0 16px`)**:
  CodeMirror derives gutter positions from content block offsets, so padding the content keeps the
  numbers aligned while padding `.cm-gutters` would shear them. When checking alignment,
  `.cm-lineNumbers .cm-gutterElement[0]` is CodeMirror's hidden width-sizing spacer — line 1 is `[1]`.
- **One unambiguous syntax style**: a local `HighlightStyle` applied via `syntaxHighlighting()` with
  `basicSetup.syntaxHighlighting` **off**. Results use Shiki's `dark-plus`, the same family, so input
  and output read as one theme.
- Shiki's generated `<pre>` carries its own background and padding, which draws a second box inside
  the result well — neutralised with `[&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0`.
- **`expand` only renders when the body is actually clipped**, measured
  (`scrollHeight > clientHeight`) via a `ResizeObserver` rather than assumed, because Shiki resolves
  highlighting asynchronously and the body grows after first paint. **Measuring is skipped while
  expanded** — there the test is meaningless and would flip the flag back off, hiding the collapse
  control.
- The `⇧↵ newline · ↑ history` hint lives on the editor and is **not** repeated in the status bar.
  Copy belongs next to the control it describes.

## Modals

`modalShell.tsx`; command, flow, project, provisioning-step, Sync's apply and profile dialogs, and
`confirmModal.tsx` all reuse it: a fixed 468px card with header / body / footer supplying their own
padding.

- **A modal must never outgrow the window.** `MODAL_CONTENT` lays the card out as a **flex column**
  with `overflow-hidden` so `ModalBody` is the scroll region and header and footer are pinned by
  `shrink-0`. **Flex, not grid** — an auto-sized grid row does not shrink to fit a container capped by
  `max-height`, so a grid card clips its footer straight off the bottom. A modal wrapping its chrome
  in a `<form>` needs `MODAL_FORM`.
- **Form labels sit above the control**, 12px sentence-case `muted-foreground`. This is _not_ the
  11px-uppercase-`glyph-dim` label role — that one is for table headers and chrome captions.
- **Gotcha — a font size handed to `Input`/`Textarea` must name the `md:` step too.** Both primitives
  carry `text-base md:text-sm`, and twMerge only collapses classes sharing a variant, so a bare
  `text-[13px]` leaves `md:text-sm` standing and it wins at every width the app runs at. Pass
  `text-[13px] md:text-[13px]`.
- **Inline field errors** carry `role="alert"`, `aria-invalid` and `aria-describedby`. The duplicate
  flag is owned by `Dashboard` and only clears on save or close, so each modal keeps a local
  `<field>Edited` flag: **editing the field hides the message until the next submit**.
- **Numeric fields are text-backed while editing**, coerced with `parseInt` on submit. Binding
  straight to a typed field writes the raw **string** into something the run loop consumes as a
  number, and it also lets the field be cleared and retyped instead of snapping back.
- The built-in corner `✕` is suppressed via `showCloseButton={false}` wherever the header draws its
  own.

## Status bar

`statusBar.tsx`. Split by meaning: **left = what we're pointed at**, **right = what just happened**.

- Left: connected device (`model · id`, **unabbreviated** — the pill carries the short form),
  `adb <version>`, target package. **An item with no value is omitted entirely, never blanked** — a
  label with nothing after it reads as a bug.
- Right is **one** status slot. Precedence: **provisioning** → **a running flow** → **the last run**.
  A routine is rarer, can spend minutes inside one push, and is what the user just pressed; flow steps
  write last-run like any other command, so without the progress-wins rule the text would churn once
  per step.
- **Tone is three-valued, not a boolean**: `ok` in `success`, `fail` in `destructive`, and `note` in
  `stale` for an outcome that is neither — a cancelled scan did not fail, and red would say it did.
  **A failure state is required, not optional.**
- **The duration is optional, and an entry without one drops the `last run:` prefix too.** Durations
  under a second read `120ms`, above it `1.4s`.
- **The slot can carry an undo** — a dotted-underlined word restoring a previous value through the
  same write path. It is the only interactive element in this bar and the whole safety net for a
  direct write, which works because the slot already answers _did the last thing I pressed work?_.
- **`adb version` prints two versions** — the wire protocol and the platform-tools build. The bar
  shows the second, minus its build suffix, and the parse returns `null` on any surprise rather than
  showing a wrong number.

## Settings

`settingsTab.tsx` + the `settings*.tsx` components: **the one screen with no design frame**,
composed from the vocabulary above rather than a new artifact. One scrolling column,
`max-w-[720px]`, no primary action, all controls the quiet 36px outline peer.

- **Both `SettingsNumber` and `SettingsSelect` commit on blur or Enter, never per keystroke; Escape
  reverts.** Each save is a config write with a snapshot in front of it, so typing `15000` a character
  at a time would be five writes and five snapshots, pushing real history out of a five-deep window.
  **Anything on this screen that writes on every input event is a bug.**
- `SettingsSelect` is a **native `<select>`** — a four-item enum in a settings row doesn't earn a
  portal, a popper and a scroll lock.
- **`PathField` is the app's one path control**, shared with Sync. `required` is optional on
  `PathSpec`: an unset path is an _error_ only where the screen can't proceed; here the same field is
  merely unconfigured and reads a neutral `Not set`. **`clearLabel` adds a reset peer, and only the
  ADB override carries one** — for that field, empty is a _working_ state ("use the bundled adb").
- **Target is open by default**, unlike every other collapsed section: with nothing set it is the only
  section that stops the app working. Its fields are labels-above and full-width, because a content
  URI or fully-qualified activity is 40–50 characters of mono. **Placeholders are shapes, not
  values** (`com.example.client`) — a copy of the seeded values here would recreate a hand-synced
  mirror.
- **Provisioning: order is the feature**, not a convenience — steps run in sequence and a failed one
  stops the routine before the relaunch. Step types get **icons, not the coloured dots command types
  use**; reusing `type-barcode` / `type-speech` would be worse than either, because those tokens mean
  _command type_ everywhere else. The step editor **refuses to save what main would silently drop**
  (`validateProvisionStep` discards a step whose required fields are missing).
- **Common commands here have no Run and no Description column.** Every other command list in the app
  fires commands; this one edits them — that is already why the screen is dockless. Add / edit /
  delete / reorder are **the dock's handlers**, on `ShellContext`, so a library edited here and from
  the dock cannot drift.
- **Data's snapshot list has no row accent, deliberately.** Marking the newest row reads as "this is
  the one you're on", and it is exactly wrong: a restore is itself a write, so it snapshots the current
  bytes first and the new top row holds the config you just moved **away from**.
- **Section order is cheapest-to-reason-about first**: Paths, Behavior, Logging, Permissions, Common
  commands, Target, Provisioning, Data. **Data stays last** because nothing above it can lose anything.
- **`SettingsSection` takes a `revealKey`** so a link elsewhere can land on a section: it expands,
  scrolls to the top of the column, and holds a `stale` border for 1500ms. It is a **changing token,
  not a boolean** — the same section can be asked for twice in a row. Screens pass the router
  `location.key`; router `state`, not a `#hash`, because this is a `MemoryRouter` where a hash carries
  no anchor behaviour and would only look like it did.
- **Permissions never claims Reverb can automate the macOS toggle**, and never opens System Settings
  behind macOS's own still-pending prompt. Status refreshes on window focus and polls only while
  waiting for approval, so the normal screen does not continually invoke `codesign`.

## Unconfigured target

`targetNotice.tsx`: **unconfigured is not an error.** Nothing failed and nothing is broken; a
capability is simply off, so it takes **`stale`**, never `destructive`.

- **The notice sits above the content; it does not replace it.** A command list with no target is
  still worth reading, editing, reordering and adding to. **Only running is off, so only running is
  taken away.**
- **Capability by capability, not one flag.** `targetCapabilities()` on `ShellContext` derives three
  flags from different fields, so no screen re-decides what "configured" means: `commands` (either
  intent action), `reset` (package id **and** launcher activity — both, because a force-stop we can't
  follow with a relaunch leaves the device worse off than doing nothing), and `scripts` (the
  script-provider URI).
- **Disabled affordances stay visible**, at 40% and `pointer-events-none`, with the reason in the
  `title`. **Refusal messages name the section to go to** — _Settings → Target_ — never just "not
  configured".
- **Two things deliberately keep working with no target**: the command bar (it is how commands get
  _saved_), and **Stop** on a running flow.
- **Main refuses regardless.** `adbManager` and `jsManager` won't compose against an empty field; every
  gate above is the affordance, not the guarantee. A malformed `am broadcast -a` reaches the device and
  fails _there_, which reads as "the device is wrong" — the outcome this whole state exists to prevent.

## Cross-surface drag

`shellDndContext.tsx`: the dock is a shell _slot_, a sibling of `<Outlet>`, so no context inside a
screen can contain both it and a flow card.

- **Only what crosses moves up**: the dock's reorder, the flow-card reorder and the dock → flow drop.
  Everything self-contained keeps its own nested context. Nesting is safe because a draggable's
  listeners come from the _nearest_ context, which is what stops a command row's grip from dragging the
  whole card.
- **Route by `data.source`, not by id shape** — dock rows are keyed by `keyword` and flows by `id`.
- **Modifiers and collision detection are per-drag, not per-context.** Dock drags swap `closestCenter`
  → **`pointerWithin`, falling back to `closestCenter`**: a flow card is tall enough that its centre can
  be further from the dragged row than a dock row's centre is, so a drop aimed squarely at a card would
  score as a dock reorder.
- **A `DragOverlay` is required here, not decorative** — dock rows live in an `overflow-y-auto` panel,
  so a row dragged toward a flow card is clipped at the dock's edge.
- **The drop appends a copy**, with a fresh `id`. A flow owning a reference to a global command would
  make deleting it from the dock a silent edit to every flow.
- Drags need 5px of movement to start, so a slipped click on a grip doesn't start one.

## Device actions

One 34px split control: `Reset client`, a divider, then a `▾` opening **Run provisioning** and, below
a separator, **Clear client storage**.

- **The container dims only when _everything_ in it is off**, with each half carrying its own
  `disabled:opacity-40` otherwise — the three actions have different requirements, and a control faded
  to 40% with a working menu inside it would be lying about which of its parts are available.
- **Clear confirms; Reset doesn't.** Reset force-stops and relaunches — nothing is lost. A wipe takes
  logins, settings and cached state, on a device, with nothing to restore from. **The confirmation body
  names the package**, in mono inside the sentence: the target is configurable, and the failure worth
  guarding against is a user who pointed it somewhere they didn't mean to.

## Provisioning run

`provisionResultModal.tsx`: **the run's promise resolving is the end signal.** `onProgress` fires
_before_ each step, so there is no "done" message; the status slot clears in a `finally`, covering a
throw as well as both return paths.

- **The report opens on failure only.** A routine that worked has nothing to read, and a dialog per
  successful run would put a dismissal between the user and the client they just spun up.
- **A refusal is the whole body** — nothing ran, so there is no step list.
- **Typeface separates the app's words from the device's.** A step's `error` is raw device output for a
  `shell` or `push` failure and a sentence of Reverb's own for a timeout or a spawn failure. When they
  differ, the sentence is prose in `red-300` and the output is a mono well beneath it; when they are the
  same, there is no sentence and the well is tinted red.

## Quick barcode rescan

A 28px scan glyph leading each barcode command row's action cluster, on the Commands list, the flow
command rows and the dock. The Settings library deliberately does **not** get it.

- **It gates on nothing.** Capture reads the screen, not the device, so it is live with no target
  configured and no device attached.
- **The write is immediate and the row is the feedback.** No confirmation — the scanned value is visible
  in the row the moment it lands. **Undo lives in the status bar**, which is the whole safety net.
- **The capture mode is a preference, not a second button** (`behavior.quickScanMode`, default
  `region`). Region is the default because this action writes without asking, and it is the one mode
  that can't be ambiguous; **an ambiguous whole-screen scan escalates to the region selector** rather
  than refusing or guessing.
- **Cancelling says `✕ scan cancelled` in `stale`, not `destructive`.** Silence is wrong for the one
  outcome where nothing on screen changes.

## Project menu

`projectSelect.tsx`: everything scoped to the open project lives here, because the top bar carries
screen identity plus device-scoped actions. Order is values, then actions, then the destructive one
alone below a rule. **Delete trashes the file rather than unlinking it**: projects are covered by no
snapshot, so the OS trash is the only undo a delete can offer.

## Screen-capture overlay

`regionSelector.tsx`, Windows only: **this surface deliberately sits outside the token system.** It
is not app chrome: it covers the user's whole desktop over a frozen screenshot of _their_ content,
and it has to read the way the OS's own capture UI does, so it uses flat `bg-black/70`, `text-white`
and `text-zinc-300`. **Do not "fix" it onto tokens** — surface tokens carry Reverb's identity, and
this overlay must not. Only one display owns a drag; the others stay inert. Escape cancels, and
cancellation is silent — it never changes the command draft.
