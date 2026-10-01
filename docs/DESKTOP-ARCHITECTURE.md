# BroadcastCG local desktop migration

Decision: 1 October 2026. This document records the repository inspection and the phased implementation requested in sections 33–55. The user's later instruction makes local operation mandatory: no ChatGPT account, Cloudflare service, hosted website, or cloud database is part of the desktop runtime. An eventual production server will be self-hosted on the user's LAN.

## 1. Architecture found in the repository

| Area | Existing implementation | Consequence |
| --- | --- | --- |
| Frontend | React 19.2.6, TypeScript 5.9.3, Vinext 1.0.0-beta.5 on Vite 8.0.13, Next-compatible app routes; Radix, Tailwind, Lucide | React client components can be bundled directly with Vite. Desktop does not require Next/Vinext SSR. |
| Backend | `app/api/**` handlers import `lib/server.ts`, which directly imports Cloudflare Worker bindings | These handlers cannot be the local desktop backend unchanged. |
| Database | Cloudflare D1; projects, channels, source credentials, asset metadata; declared with Drizzle | SQLite-compatible model, but provider-specific calls and authentication require a new adapter. |
| Media | R2 image objects referenced through `/api/assets/:id` | Assets must be stored locally and included when transferring projects. |
| Authentication | Hosting-provided identity headers and ChatGPT sign-in routes | No local accounts, password verification, RBAC, project grants or session revocation exist. |
| Realtime | No application WebSocket or SSE implementation. Output polls `/api/program` every 400 ms | Polling is inadequate for synchronized multi-operator production. |
| Rendering | React SVG: text, rectangle, ellipse and image layers; `requestAnimationFrame`; linear/smooth/step keyframe interpolation | Reusable 2D renderer; not a frame-locked CG or hardware-output engine. |
| Panels | Zod-validated controls inside project JSON; grid or absolute x/y/width/height; variable bindings and actions per control | Existing panel definitions survive desktop migration. |
| Actions | Sequential async loop in `studio.tsx`; set/increment/preview/take/hide/update/fetch/delay; simple variable conditions; AbortController | Logic runs in operator UI, not a durable authoritative command service. No command IDs, persisted workflow or rollback. |
| Templates | Scenes/layers/keyframes stored in version-1 project JSON; tool presets and formations also embedded | Schema can remain; published template versions and approval states are future work. |
| Live state | One Program snapshot per hosted owner; editor state and clock hooks are local to the page | There is no ownership arbitration, atomic shared score increment or server clock. |
| Persistence | Whole-project autosave, revision conflict rejection, in-memory undo history | Reuse validation and conflicts; add local durability, recovery and migration rules. |
| Browser behavior | Relative fetch, file inputs, Blob downloads, SVG-to-canvas PNG export, new output tab, page unload guard, optional WebMCP detection | Redirect local requests through an internal protocol; provide Windows file dialogs and native output windows. |
| Other infrastructure | Connector/hosting scaffolding, Cloudflare plugins, Wrangler and D1 migration tooling | Not imported by the desktop bundle; retained source is migration history, not a deployed dependency. |

Inspection covered application entry points, all studio feature modules, models/utilities, all API routes, database schema/migrations, auth, connector scaffolding, build/package configuration and tests. The reusable `components/ui` directory is presentation scaffolding, not a separate service or production authority.

## 2. What stays

Retain the React design and animation tools, SVG layers/keyframe interpolation, panel builder, custom formations, sports/esports recipes, variable type handling, data binding, schema validation and project revision checks. Keep their existing tests. The desktop entry imports the same components rather than copying the application into a second frontend.

## 3. What changes

Replace cloud storage/authentication with local services; split renderer, native OS access, persistence and future playout command authority. Replace browser-only project transfers with native dialogs and complete image packages. Provide bounded, validated interfaces rather than exposing Node, arbitrary IPC, SQL, shell commands or filesystem paths to the renderer. Move shared clock/score/action authority out of React before enabling multiple operators. Later migrations must preserve schema versions and support backup/rollback.

## 4. Desktop runtime decision

Use Electron, pinned to 44.5.1 for this foundation. It bundles the rendering engine and Node runtime, supports the existing React/TypeScript project directly, and avoids changing rendering behavior based on each workstation's WebView2 installation. Tauri remains a reasonable smaller alternative but introduces Rust development and WebView2 qualification without reducing the current application's larger architecture gaps.

The desktop renderer is sandboxed with context isolation, Node integration disabled, a restrictive content security policy and a narrow validated preload bridge. Only local bundled code is navigable. Permissions and arbitrary popup windows are denied. `broadcastcg://app` is an internal protocol, not a listening localhost server. There is no HTTP port, public deployment or hidden hosted-site fallback.

References: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [custom protocols](https://www.electronjs.org/docs/latest/api/protocol), [Tauri WebView versions](https://v2.tauri.app/reference/webview-versions/), [Electron release information](https://releases.electronjs.org/release?channel=stable).

## 5. Database and service architecture

**Implemented foundation:** one installed workstation, one application instance, one local SQLite authority in `%APPDATA%\BroadcastCG\data\broadcastcg.sqlite`. WAL, FULL synchronous mode, schema version checking and optimistic project revision validation are enabled. Project documents and image blobs are transactional local data. Settings and editor recovery snapshots are separate from installation binaries. Source headers are protected using Electron safeStorage/Windows DPAPI; they are never exported in projects or diagnostics.

The native process owns the SQLite connection in this phase. Documents and images are size-limited. Synchronous database calls must be moved to a dedicated local service/utility process and profiled before broadcast qualification; this phase does not claim nonblocking database latency under heavy media load.

**Proposed production architecture:** the same application service contract gains a local IPC adapter and a self-hosted LAN HTTPS/WebSocket adapter. A Windows service owns command handling, sessions, workspace grants, output channels, engine connections and an append-only event stream. SQLite remains suitable for a single service with controlled writes; PostgreSQL on the user's own server is recommended when multiple shows/operators and operational tooling justify it. No cloud provider is required.

Network commands carry command ID, workspace, actor/session, workstation, expected revision, target channel and ownership lease. The server validates permissions/ownership, applies atomic updates, records outcome, and broadcasts ordered events. Clients reconcile a snapshot plus event sequence after reconnect. Never blindly retry TAKE, CLEAR or macros after a lost response; query command outcome and actual engine state. Score increments are atomic commands, not whole-document last-write wins. Backups must use consistent database snapshots, not copies of a live SQLite WAL pair.

## 6. Local authentication and authorization — implemented in 0.2.0

Phase 2 implements local administrator setup, password login/logout, disabled users, temporary-password change/reset, five roles with per-user permission overrides, workspace grants, revocable sessions and actor-attributed audit history. Password verification uses Node scrypt with independent salts. Access tokens stay in Electron main; only token hashes are stored in SQLite. Optional remembered sign-in is DPAPI protected on disk. No renderer localStorage token or cloud identity is used.

Permission checks protect project changes, exposed operator fields, source endpoints/credentials, images, import/export, recovery, output commands and native settings. A dedicated output session has a main-process-only read capability for the active program and its media. Logout and session expiry lock controls without clearing output. See [account behavior, roles and limits](LOCAL-ACCOUNTS.md).

This is one local authority, not a shared LAN server. App accounts do not protect data against someone who can modify the Windows account’s files. Custom named roles and template publication remain future features; this version supports the five predefined roles and individual capability overrides.

## 7. CG/render and acknowledgement architecture

**Foundation:** a separate native output window renders the existing SVG scene. Local TAKE fails if the output window is unavailable. The service allows one outstanding output command, sends a revision-tagged update over Electron IPC, and waits up to three seconds for the output renderer to commit and pass two animation frames. Timeout is reported as unconfirmed; no automatic command replay occurs. Output polling remains as a state resynchronization fallback. The application always starts with empty Program after restart.

This acknowledgement proves a renderer update, **not** a physical display scanout, complete remote-image/font readiness, SDI/NDI emission or frame synchronization. Hardware output, fixed frame rate, alpha/fill/key, latency budgets, genlock, GPU stress behavior and redundant playout remain unimplemented. The operator strip explicitly identifies this as desktop output.

**Production proposal:** isolate the render engine from the editor/operator. Use a monotonic engine clock, versioned immutable scene packages, asset readiness checks, channel/layer state and engine-side command ordering. Distinguish accepted, rendered, on-output, failed and unknown outcomes. Integrations need protocol-specific adapters and observable acknowledgements. Display diagnostics only when measured; never mark a nonexistent engine healthy.

## 8. Phases and exit criteria

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| 1 — Local desktop foundation | Existing editor in Electron; SQLite/images; native output and file dialogs; Windows x64 installer; no hosted runtime dependency | Existing tests plus persistence/conflict/recovery/command tests and native runtime smoke test pass; packaged window launches. |
| 2 — Accounts and RBAC | Local login, initial administrator, user/role/workspace management, sessions, audit actor identity | Direct unauthorized service calls rejected; disabling/reset/revocation tested; no plaintext passwords/tokens. |
| 3 — Panel builder | Reusable groups, touch sizing, richer layout/selection/undo, validation and reusable production components | Saved layouts remain editable and versioned; accessibility and touch checks pass. |
| 4 — Actions/logic/macros | Server-side command model, typed conditions, timers, cancellation and ownership hooks | Reconnect/duplicate/partial-failure behavior deterministic; no accidental replay. |
| 5 — Sports/esports | Extend the existing controls with game-specific state, clocks, roster/stat mappings and workflows | Verified rules, atomic score operations, authoritative clock and repeatable show scenarios. |
| 6 — PSD | Layer/asset import with supported-feature report | Unsupported effects/font dependencies reported; imported layout visually compared to references. |
| 7 — AE conversion | Explicit interchange/conversion pipeline and supported animation subset | No claim of arbitrary AEP/expressions/plugin parity; conversion diagnostics and reference renders. |
| 8 — LAN production | Configurable server profiles, local Windows service, HTTPS/WebSocket, locks, backup server and diagnostics | Multi-client conflict, disconnection and failover tests; engine state remains authoritative. |
| 9 — Deployment/recovery | Signed installer/upgrades, controlled updates OFF by default, full `.broadcastpkg`, backups, migration rollback, workspace/panel/window recovery | Clean-machine install/upgrade/uninstall matrix and crash/power-loss recovery without on-air replay. |
| 10 — Broadcast qualification | Selected CG/SDI/NDI engine integrations, frame timing, soak tests and documented operational limits | Measured latency/frame-drop budget; redundancy/operator safety and hardware validation. |

Installer scaffolding, basic window recovery, diagnostic export and image-containing `.broadcastproject` files are pulled forward to phase 1 because the desktop needs them. This does not make the full phase-9 update/backup system complete.

## 9. Risks and explicit limits

- Local account permissions are implemented. No network endpoint or shared multi-user service is enabled; Windows file access remains the outer trust boundary.
- Desktop action sequences now execute in the local service and survive renderer reload. Application restart interrupts pending sequences without replay. Sports clocks now run in the local service, survive editor reload and pause on application restart; no multi-client network mode is enabled.
- Native output uses Chromium/SVG and wall-clock timing. It is not a qualified broadcast output engine or an After Effects/Photoshop replacement.
- Images embedded in `.broadcastproject` move with projects. Fonts, videos, arbitrary plugins, remote URLs and credentials do not. Missing local images block import/export. External dependencies are shown during import.
- Recovery snapshots are debounced and bounded; a crash may lose the last fraction of a second of editing. Restoring a stale draft creates a copy instead of overwriting newer saved data. Program is intentionally not restored.
- Current application preferences include identity, UI scale and startup; unimplemented integration/settings categories are not presented as working controls.
- Installer is unsigned until a signing identity is supplied. Windows trust/signing and full Windows 10/11, mixed-DPI, touch and monitor-removal qualification are release tasks. No automatic updater or telemetry is installed.
- The original hosted source remains for migration reference but is excluded from the desktop runtime. Existing remote projects are not silently downloaded or deleted. Import supported local exports explicitly.
- SQLite schema v4 migrates earlier versions transactionally after consistent backups and rejects newer schemas. Downgrading in place is unsupported; keep the pre-upgrade backup.

## 10. Dependencies and release ownership

Development uses the existing React/TypeScript/Vite toolchain plus pinned Electron 44.5.1 and electron-builder 26.15.3. Node's bundled SQLite avoids requiring an end-user database installation or a separate native SQLite module. Build tooling downloads Electron and NSIS on the developer workstation; the generated offline installer carries the complete runtime. The packaged app contains no Cloudflare/ChatGPT SDK, server or authentication dependency.

Future production dependencies are a signing identity, optional self-hosted Windows service/PostgreSQL installation, required fonts/media licenses, chosen CG/output SDKs and documented integration endpoints. These choices should be qualified individually, not replaced with decorative buttons.

## Verification

Automated tests cover local persistence across reopen, stale revision rejection, unavailable/unacknowledged output, concurrent command rejection, recovery conflicts, image package round-trip/remapping, missing media validation, protected credential requirements and monitor-bound restoration, alongside the existing design/panel/formation/action tests.

The real Electron smoke test runs an isolated data profile, loads the bundled renderer, checks Node globals are absent, saves/reads a local project, verifies offline TAKE rejection, opens the native output, waits for an actual renderer acknowledgement, verifies the output SVG and hides it. Packaged Windows UI checks verify the design workspace, panel builder, tool library and settings. Installer creation is verified; a full clean-machine install/upgrade/uninstall and hardware matrix is deferred to phase 9/10.

Phase 2 adds 12 security tests (35 total automated tests), including role/workspace denials, password changes and resets, disabled users, token rotation/revocation, idle/absolute expiry, endpoint credential isolation and v1 migration. Native Electron tests verify first-run setup, main-only tokens, temporary-password enforcement, Viewer write/settings denials, logout with continuing output, and the read-only output partition. UI screenshots are inspected during QA.

Phase 3 (0.3.0) adds optional layoutVersion 2 metadata, multi-selection, groups, move/scale/alignment/distribution, snap/zoom, visibility and locks, project-scoped reusable component snapshots, configuration validation and 44 px touch operation. Old projects load without a schema migration; new metadata survives local persistence and project export. Eleven new model/policy tests bring the automated total to 46. Native Electron tests additionally exercise pointer gestures, keyboard undo/redo, group locks, component variables, touch bounds, validation and save/reopen. A live clock no longer starves autosave. See [panel builder guide](PANEL-BUILDER.md) for controls and limits.

Phase 4 (0.4.0) moves desktop action sequences and transport output commands into a journaled local command service. It adds reusable nested macros, typed AND/OR conditions, monotonic timed waits, cancellation, per-workspace execution ownership and output reservation, session revalidation, persisted step outcomes and replay protection. Schema 3 backs up schema-2 data before adding the command journal. Seventeen new command/logic tests bring the automated total to 63. Native tests author and run a macro, use typed condition dropdowns, verify TAKE acknowledgement, reload during a wait without duplicate execution, and cancel pending steps. See [actions and macros](ACTIONS-AND-MACROS.md).

Phase 5 (0.5.0) adds the Sports workspace, monotonic local clocks, atomic bounded counters and sports score commands, football/basketball/volleyball/esports workflows, typed roster import and API mappings, player statistics, map drafts and set/series results. Fifteen new automated tests bring the total to 78. Native QA verifies clock continuation through editor reload and output polling, scoring, 14-second reset, map completion, player statistics and compact-window layout. Schema 4 creates a consistent pre-upgrade backup for schema 3. See [sports and esports guide](SPORTS-AND-ESPORTS.md) for supported rules and operational limits.


Phase 6 (0.6.0) adds local PSD inspection and import in a worker, comparative previews, editable supported point text, cached pixel layers, imported group hierarchy/opacity/visibility, font matching/substitution, persistent conversion reports and saved reference images. Scene/media insertion is transactional, permission-checked and revision-checked; import never publishes output. Schema 5 prevents older releases from stripping group metadata, with a consistent backup on upgrade from schema 4. See [PSD import guide](PSD-IMPORT.md) for the deliberately bounded conversion subset. After Effects conversion remains phase 7.


Phase 7 (0.7.0) adds a local versioned `.bcae` interchange pipeline and bundled ExtendScript exporter, bounded inspection worker, sampled 2D animation, anchor/scale tracks and in/out timing, font matching, reference-frame attachment/comparison, persistent diagnostics, editable key times/values/interpolation and transactional imports. Existing data bindings and panel actions can operate converted scenes. Schema 6 blocks older serializers from stripping AE metadata and backs up schema-5 profiles first. See [AE conversion guide](AE-CONVERSION.md). Direct AEP opening, nested composition/vector/effect/plugin parity, video fallback and automatic AE rendering are not included. Unit, scripting-contract and native-runtime tests cover the local pipeline; the exporter still needs Adobe-hosted validation because AE is not installed here. Phase 8 remains LAN/multi-client production architecture.
