# Local accounts — BroadcastCG 0.2.0

On first launch, create an administrator username and a 15–128-character password or passphrase. No default account, online identity or email service is used. Existing phase-1 projects stay in the local database and are accessible to the first administrator.

Open **Accounts & access → Users → Add user**. Assign a role, choose saved workspaces (or all current and future workspaces), and enter a temporary password. Give that password to the intended operator through your normal trusted channel. The app requires them to change it before accessing projects. Click your own name in the top strip to change your password; an administrator can reset another user's password or disable their account. Keep access to an administrator account: this release has no email recovery or unauthenticated password-reset backdoor.

## Default capabilities

| Role | Default access |
| --- | --- |
| Admin | All workspaces, design, operation, output, accounts and system configuration |
| Designer | Design/animation, panel building, data configuration, import/export and control operation; no TAKE/update/hide permission |
| Operator | Assigned projects, exposed control values, rosters, data refresh, TAKE/update/hide; no design or panel layout changes |
| Engineer | Assigned projects, data configuration, feed credentials, output/display settings, system settings, audit and diagnostics; no TAKE |
| Viewer | Read assigned projects and monitor output; no project or output commands |

**Individual permissions** override role defaults. Denials win over grants. Administrator permissions cannot be restricted; use another role for a restricted account. User-management permission grants authority over all local accounts, including role assignment. Workspace access still applies to project operations. Creating a workspace automatically grants its creator access. Projects are the workspace boundary in this version. Custom named roles, approval-based template publishing and shared LAN users are not implemented; publication permission is visibly marked reserved.

Operator fields come from saved controls, their variable actions, data bindings and football components. An operator may update those values while preserving their types. The service checks the entire submitted project: posting a modified scene layout or panel definition directly does not bypass role restrictions. A program scene must match a saved graphic. Changing an API endpoint removes its stored request headers; configure credentials again for the new endpoint.

## Access periods

In **Accounts & access**, set a start date and expiry date or use 7/30/90/365-day presets. Blank expiry is unlimited. The active local/server authority enforces the deadline; existing sessions and remembered sign-ins cannot outlast it. Renew +30 days extends from the later of the current deadline or now. Access edits revoke sessions. One enabled unlimited administrator must remain. See [recipient setup and recovery](DEPLOYMENT-AND-ACCESS.md).

## Sessions and output

Sessions expire after 30 minutes without user input or after 12 hours total. Background status/data polling does not keep them active. **Remember me** stores an encrypted, rotating sign-in token for 30 days in the current Windows account; restarting the app can use it to create a new session. Signing out removes that remembered sign-in. Password changes, password resets, access edits, disabling a user and session revocation invalidate affected sessions and remembered tokens. Revocation is immediate at the service; the screen locks on its next request or within the five-second status poll.

**Accounts & access → Sessions** lists active local sessions and lets an administrator revoke them. Logout and expiry leave the current output graphic on screen. Authority-managed sequences recheck account access during waits and before further effects. Production clocks run on the authority and pause at their last checkpoint on application/server restart. Closing the application closes output; reopening starts off air and never replays TAKE commands.

Unsaved recovery drafts belong to individual users. They are saved after a short debounce, and sign-out attempts to flush the latest draft. A recovery conflict can be opened as a new project only when the user has permission to create one. Program is independent of draft recovery. Optional [self-hosted production mode](LAN-PRODUCTION.md) provides shared state and authoritative clocks.

From 0.21.4, local session expiry hides and locks the open editor while retaining its draft in memory. Sign in with the same account to resume after workspace access is rechecked. Keep the window open until the draft is saved; changes made after the last recovery write are not yet on disk. Unsent button presses are cancelled at lock and never replayed after sign-in. Active input is counted even when editor controls consume pointer or keyboard events. Failed saves before command submission release the control lock; unknown dispatched outcomes remain subject to service verification without automatic retries.

## Audit and storage

Audit history can be filtered by username, action, workstation, workspace ID and local date/time. It shows the newest 500 matching events: sign-ins, failures, account/session changes, permission denials, project/graphic/panel changes, exposed variable before/after values, data fetches and acknowledged/unconfirmed output commands. Passwords, session tokens and request-header values are excluded. Graphic/panel events identify the affected item and its old/new name, not a full version history. The audit is local SQLite history, not a tamper-evident external log.

The service uses Node scrypt with N=131072, r=8, p=1, a random 16-byte salt and a 64-byte derived key. Password verification uses constant-time comparison. Only hashed session and remembered tokens are stored in the database. Raw access tokens stay in Electron main; the renderer receives safe session metadata. Windows DPAPI protects remembered sign-in and feed credentials on disk. Failed sign-ins have per-account and workstation-wide limits. This configuration follows the [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

The dedicated output partition can only read the current program and its local media. It cannot access accounts, other projects, settings or write endpoints. Local mode opens no listener. Optional production mode uses your own HTTPS server. No cloud authentication or hosted runtime is required.

Starting with 0.16.3, normal local workstation data is in `%USERPROFILE%\.broadcastcg\data`. This location is shared when the app starts from a shortcut or another Windows application. Explicit custom/QA profiles keep their own storage. The first launch copies a consistent snapshot of an existing profile, including accounts, projects, images and protected remembered-login files, into this stable location. The original `%APPDATA%\BroadcastCG\data` or virtualized profile is retained. If different profiles contain conflicting saved work, startup stops with their paths rather than replacing one or asking for another account.

Upgrading schema 1 to schema 2 first makes a consistent SQLite backup under `backups`, then adds account/grant/session tables in a transaction. Unknown newer schema versions are rejected. In-place downgrade is unsupported. To restore a pre-upgrade backup, close the app and retain the entire current data directory before any manual restore; do not replace a live database or its WAL files.

Application permissions do not defend against someone who can edit the Windows profile, database or application binaries. Use separate Windows accounts and appropriate filesystem access for that boundary. This release does not claim full-disk encryption, tamper-proof auditing, signed binaries or broadcast-hardware qualification.
