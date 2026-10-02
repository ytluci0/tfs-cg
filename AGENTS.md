# BroadcastCG repository guidance

## Scope and working directory

- This repository contains the BroadcastCG Windows desktop application. Run application commands from this repository root; paths below are relative to it.
- This checkout may sit inside another workspace repository. Inspect this repository's status and diff before editing; preserve unrelated changes. Keep old archives and dependency caches out of Git.
- Read applicable nested `AGENTS.md` files before changing their directories. Prefer current source and package scripts over historical phase descriptions in the documentation.

## Product direction

- BroadcastCG is a local Windows graphics design, animation, sports/esports control, and broadcast application. Keep normal operation available offline.
- Do not deploy to ChatGPT Sites, Cloudflare, or another cloud provider unless the user explicitly changes the local-only requirement. Retained hosting configuration and web dependencies are migration history, not the desktop deployment target.
- External data feeds, OBS/NDI output, and self-hosted LAN production are optional, explicitly configured integrations. Do not enable listeners, publish graphics, or change Windows security settings as a side effect of ordinary editing.
- Build reusable, configurable tools: editable layers and masks, property animation, data bindings, independently designed buttons, dropdowns, counters, and panel parts. Preserve the ability to construct custom layouts rather than providing only fixed sports templates.
- Maintain the supported 60 fps settings and shared rendering behavior. Do not claim hardware timing, Adobe plugin compatibility, or complete Photoshop/After Effects parity without actual qualification.

## Source map

| Location | Responsibility |
| --- | --- |
| `app/studio/studio.tsx` | Project state, editor views, undo/history, staging and output orchestration |
| `app/studio/designer.tsx`, `canvas.tsx` | Design/Animate composition and shared graphics rendering |
| `app/studio/design-workspace.tsx`, `design-canvas.tsx` | Movable panels, canvas navigation, drawing and mask editing |
| `app/studio/animation-timeline.tsx`, `timeline-number.tsx` | Expandable property tracks, keyframes and numeric scrubbing |
| `app/studio/panels.tsx`, `control-surface.tsx`, `button-art-editor.tsx`, `panel-parts.tsx` | Panel authoring, operator controls and custom button design |
| `lib/studio-model.ts`, `lib/timeline-tools.ts`, other `lib/` helpers | Project validation, types and reusable editing operations |
| `desktop/main.cjs`, `preload.cjs`, `renderer.tsx` | Electron lifecycle, narrow renderer bridge and desktop entry |
| `desktop/local-service.mjs`, `security.mjs`, `command-engine.mjs` | Local persistence, authorization and authoritative actions |
| `desktop/network-*.mjs`, `server-*.mjs` | Optional self-hosted production service and clients |
| `desktop/output-*.cjs`, `output-*.mjs`, `ndi-*.cjs`, `ndi-native.cs` | Output adapters and native sender |
| `desktop/psd-*.mjs`, `psd-session.cjs`, `ae-*.mjs`, `ae-session.cjs` | Bounded local import/conversion pipelines |
| `tests/`, `desktop/*-smoke.mjs` | Model/service tests and native Electron acceptance checks |

Keep shared behavior in the existing model/service helpers. Do not duplicate the editor for desktop or introduce a separate implementation of rendering, animation, or control actions without a concrete need.

## Setup and commands

Use Node.js **24 or later**, Windows PowerShell, and the checked-in dependency versions. The desktop build also invokes the Windows .NET Framework C# compiler; inspect `desktop/build.mjs` when diagnosing native helper failures.

- Root dependencies use `package-lock.json`: `npm run install:ci`.
- Desktop dependencies use `desktop/pnpm-lock.yaml`: `pnpm --dir desktop install --frozen-lockfile` when needed. Do not rewrite lockfiles or switch package managers incidentally.
- If Electron's downloaded runtime is missing, use the existing `install:runtime` script in `desktop/package.json` after installing its dependencies.
- Check the actual Node version before running tests. Use an available Node 24+ runtime explicitly if the shell resolves an older installation.

Run from the repository root:

```powershell
# Type checking
node node_modules/typescript/bin/tsc --noEmit

# Model and service tests; use a specific test file for focused checks
node --experimental-strip-types --test tests/*.test.mjs

# Compile the local renderer, services and Windows helpers
node desktop/build.mjs

# Launch the desktop application
node desktop/run.mjs

# Native acceptance suite using an isolated data profile
node desktop/run.mjs --smoke-test

# Build and package a Windows x64 installer; never publishes online
node desktop/package.mjs

# Optional portable executable
node desktop/package.mjs --portable
```

`run.mjs` only builds when the service bundle is missing; rebuild after source changes before running native checks. `package.mjs` always builds. Run build, smoke checks and packaging sequentially: active native sender/helper processes can lock the executable being compiled.

Do not edit generated `desktop/app/`, `desktop/release/`, dependency folders, caches, or generated Windows helper binaries as source. Files under `desktop/.cache/` may be useful local diagnostics, but are ignored, potentially stale, and not portable release tooling.

## Editing and interaction requirements

- Keep the editor chrome compact to prioritize the canvas. Preserve movable/resizable workspace panels and mouse zoom/pan.
- Show the Preview/TAKE/Update live/Hide transport strip only in the **On air** tab. Editing, importing, saving, and staging must not implicitly TAKE a graphic.
- Timeline numeric properties support horizontal dragging with live canvas preview, Shift for coarse adjustment, Alt for fine adjustment, Escape to cancel, and click-to-type.
- One completed drag is one Undo step. Intermediate previews must not write project history or persist partial changes. Respect locked layers and cancel gestures on lost capture, cancellation, or invalidated selection/context.
- Use the existing timeline value/keyframe helpers so static properties and animated values at the playhead follow the same rules.
- Preserve old project compatibility, imported assets and group metadata, data bindings, masks, button states, and output/export rendering when extending schemas. Use defaults for optional new fields and explicit migrations for storage changes.
- Keep authorization in the service/main process. Preserve renderer sandboxing, context isolation, disabled Node integration, and validated preload/IPC boundaries. Never put credentials or session tokens into renderer storage, exported projects, or diagnostics.

## Verification

- Match checks to the change. Documentation-only changes need content/link review; small reversible style changes need relevant visual checks. Behavioral changes need focused tests and type checking, plus native acceptance checks where browser/Electron interaction matters.
- Test meaningful outcomes, including undo/cancel, save/reopen, permissions, and relevant output behavior. Avoid assertions that merely repeat implementation details.
- Native QA must use isolated profiles. The `--smoke-test` path creates its own profile and writes `desktop/.cache/smoke-result.json`. Verify the current process exit and a fresh report; never cite a stale report as a new success.
- Keep QA actions away from the user's live project/output. Do not reset the real profile, bypass authentication, adjust the Windows clock, or modify real account grants to make a test pass.
- For synthetic Electron drags, `mouseMove` events need the `leftButtonDown` modifier while dragging. Await inserted text and allow input state to update before sending Enter.
- Check changed workspace layouts at practical desktop sizes, including 1280x720 and 1920x1080. Preserve access to controls at smaller sizes.
- Report exactly what was checked and what remains unverified. Renderer acknowledgement does not establish physical broadcast output, frame locking, or Adobe-host compatibility.

## Local releases and user data

- The desktop release version comes from `desktop/package.json`, not the legacy root package version. Inspect current files rather than assuming a previous version or test count.
- A build is not an installed release. When deployment is requested, package, install locally, verify the installed application, and state whether those steps actually completed.
- Before replacing an installed release, preserve the prior installer and obtain a consistent backup of project/account/asset data. Use the application's backup path or an appropriate SQLite snapshot; do not naively copy a running database with uncheckpointed WAL data.
- The usual installed executable is `%LOCALAPPDATA%\Programs\BroadcastCG\BroadcastCG.exe`; normal local data is `%USERPROFILE%\.broadcastcg\data` starting with 0.16.3 (earlier profiles used `%APPDATA%\BroadcastCG\data`). Verify actual paths and active processes before operating on them. Installation binaries and user data are separate.
- Respect the user's existing authorization for local installation and restarts; avoid repeated confirmation requests for already-authorized actions. Check save state and active output before a restart, close normally, and preserve unsaved work. Existing authorization does not override tool permission requirements.
- Never delete/reset the real profile, discard assets, downgrade a newer database in place, or silently replay TAKE/macros during recovery. Preserve rollback data with its matching application release.
- Inspect package contents so test profiles, databases, credentials and hosting configuration do not enter the installer. Verify the installed version/artifact and original project identity, revisions, database integrity and asset/account counts after upgrade.
- Local helper scripts can contain hard-coded version numbers, hashes and paths. Read and adapt them before use; do not blindly rerun historical deployment scripts.

## Windows and repository hygiene

- Use `rg` for searches and quote paths with spaces. Use explicit working directories and task-specific variable names; do not repurpose `$HOME` or `$CODEX_HOME`.
- Use PowerShell filesystem operations with `-LiteralPath`. Before recursive removal or moving directories, verify resolved paths are inside the intended workspace/target. Do not compose destructive operations across shells.
- Start background helper/test processes with `-WindowStyle Hidden`. Open the user-facing app normally when intentionally showing it.
- If Git reports a safe-directory mismatch, use a per-command exception for the exact verified repository rather than disabling the protection globally.
- Keep changes scoped and preserve unrelated work. Do not commit installers, archives, credentials, user profiles, generated bundles or caches.

## Further documentation

Use the relevant guides under `docs/`: [Desktop architecture](docs/DESKTOP-ARCHITECTURE.md), [deployment and recovery](docs/DEPLOYMENT-AND-ACCESS.md), [local accounts](docs/LOCAL-ACCOUNTS.md), [LAN production](docs/LAN-PRODUCTION.md), [design workspace](docs/DESIGN-WORKSPACE.md), [animation timeline](docs/ANIMATION-TIMELINE.md), [custom buttons](docs/CUSTOM-BUTTONS.md), [PSD import](docs/PSD-IMPORT.md), [AE conversion](docs/AE-CONVERSION.md), [broadcast output](docs/BROADCAST-OUTPUT.md), and [NDI output](docs/NDI-OUTPUT.md). Historical phase notes may describe older limits; verify present implementation before making claims.
