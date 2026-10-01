# BroadcastCG — local Windows desktop

BroadcastCG has a local Electron desktop build using the existing graphics editor, animation tools, panel builder and sports/esports controls. It runs without ChatGPT, Cloudflare, a browser or an internet connection. Local mode opens no network listener; optional production mode hosts HTTPS on your own PC or LAN server. External feeds/images require a connection only when configured by the operator.

Version **0.8.0 adds phase 8: self-hosted LAN production**. Open **Connections** to create/test saved HTTPS server profiles, start a separate local production authority, attach an output workstation, request workspace control and save encrypted server backups. Shared scores, clocks and commands remain server-owned; dropped connections never replay TAKE. Dirty drafts are protected on the client. Backup switching is manual, with no live replication. See the [LAN production guide](docs/LAN-PRODUCTION.md) for setup, Windows service installation and qualification limits. PSD and supported AE conversion remain available; further Adobe plugin testing is deferred. SDI/NDI and hardware qualification remain phase 10.

## Windows release

The build produces `desktop/release/BroadcastCG-Setup-x64.exe`. Run the installer, then open **BroadcastCG** from the Windows Start menu. Node.js, a database and development tools are not required on the receiving PC. This build is unsigned.

The assisted installer supports installation-directory selection, Start menu integration and uninstall. Project data remains outside the installation in `%APPDATA%\BroadcastCG\data` and is preserved on uninstall. A normal reinstall must not remove that directory. Automatic updates are disabled.

- **First launch:** create your own administrator username and passphrase (15–128 characters). There is no default password.
- **Accounts & access:** add local users, assign workspaces and roles, reset passwords, revoke sessions and filter audit history. Newly created users must change their temporary password. Click your name to change your own password.
- **Design / Animate:** use the existing layer editor and keyframes; drop PNG/JPEG/WebP files from Explorer onto the design canvas.
- **Panels → Build:** open Tool library for sports/esports presets, arrange controls, Shift-click to select several, group/align/resize them and save selections in Components. Choose Touch operation for larger targets. Validate checks connections before Operate. Read the [panel builder guide](docs/PANEL-BUILDER.md).
- **Macros:** open Panels → Macros to create reusable sequences; assign Run macro to any action button. Execution history shows step outcomes and reconnects to active work without replay. See the [actions and macros guide](docs/ACTIONS-AND-MACROS.md).
- **Sports:** configure a match, operate scores/clocks, map rosters and statistics, complete sets/maps, and update your live graphic. Clock values continue through editor reload and pause on application restart. Read the [sports and esports guide](docs/SPORTS-AND-ESPORTS.md).
- **Open output:** opens a native graphics window. Use the Output menu to select a monitor and F11 for fullscreen. TAKE requires this output to be available and acknowledge the scene update.
- **Export / Import:** native Windows dialogs read/write `.broadcastproject`, including local images. Previous `.frame.json` projects can be imported if their referenced images are available. Missing local media blocks import; external dependencies are reported.
- **System:** workstation identity, UI scale, Windows startup, display selection, measured local status and diagnostic export.
- **Recovery:** an unsaved draft is offered on restart where available. Users with workspace-creation permission can recover conflicting drafts as separate projects. Program always starts off air; commands are never replayed.

All working projects and assets are local. The app does not automatically download projects from the former hosted site. In local mode API headers use Windows DPAPI. Production servers use a private server encryption key; both exclude headers from ordinary project exports. Encrypted server backups include credentials. Upgrading from phase 1 makes a consistent database backup in the data folder’s `backups` directory before adding account tables. Existing projects and media remain local; the first administrator can access them. Do not copy a live SQLite file for manual backup; use project export or close the application first. Upgrading from 0.2/0.3 creates a consistent `before-commands-*` backup before adding the command journal. Upgrading from 0.4 creates a consistent `before-sports-*` backup before migrating SQLite to schema 4. Upgrading from 0.5 creates a consistent `before-psd-*` backup before advancing to schema 5, which prevents older apps from losing PSD group metadata. Upgrading from 0.6 creates a consistent `before-ae-*` backup before advancing to schema 6, protecting AE transform/timing/reference metadata. Never downgrade the same data folder. Read [local account and security details](docs/LOCAL-ACCOUNTS.md).

## Development

Developer prerequisites: Node.js 24 and a Windows x64 build environment. Install the repository's root dependencies using its existing package lock, then install desktop tooling separately:

```powershell
npm ci
cd desktop
pnpm install --frozen-lockfile
node node_modules/electron/install.js
cd ..
node desktop/build.mjs
node desktop/run.mjs
```

Electron 44 requires its explicit binary-install command shown above. The desktop lockfile pins Electron and electron-builder independently of the legacy web stack. The electron-winstaller install script is disabled because this application uses NSIS, not Squirrel.

```powershell
# Validate application code and service behavior
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs

# Build first (also compiles the certificate/service helper), then test the real runtime
node desktop/build.mjs
# Uses a unique desktop/.cache/smoke-profile-*
node desktop/run.mjs --smoke-test

# Build the installer (also rebuilds the local application)
node desktop/package.mjs

# Optional self-extracting portable executable
node desktop/package.mjs --portable
```

The portable target also stores user data in AppData, separate from its temporary extracted binaries. A removable-drive data mode is not implemented.

The application build uses Vite to bundle React, esbuild for the local service, bundled Node SQLite, and electron-builder/NSIS for distribution. Only the desktop bundle and narrow native host are packaged. Never package dependency caches, test profiles or credentials.

## Source map

- `app/studio/` — shared existing editor, animation, panel and data tools.
- `lib/studio-model.ts` — validated project/scene/control models and type-safe actions.
- `desktop/main.cjs`, `preload.cjs` — native host, internal protocol, dialogs, output acknowledgements and OS integration.
- `desktop/local-service.mjs` — local SQLite persistence, recovery, image package transfer and data fetching.
- `desktop/renderer.tsx`, `accounts.tsx` — login, user administration, audit and system UI.
- `desktop/security.mjs`, `project-policy.mjs`, `lib/permissions.ts` — account authority, migration and capability checks.
- `desktop/electron-builder.json` — offline Windows installer configuration.
- `tests/desktop-service.test.mjs`, `desktop/smoke.mjs` — persistence/safety and actual-runtime verification.

Historical cloud routes and hosting configuration remain in source for migration reference and are not imported into the desktop build. Root dev, build and start now target desktop. Former web commands are explicitly named legacy:web:*. [Original web documentation](docs/LEGACY-WEB.md) describes only the previous application.
