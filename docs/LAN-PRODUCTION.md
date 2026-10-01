# Phase 8 — local LAN production (0.8.0)

BroadcastCG can run locally or connect its native desktop client to a server you host. There is no ChatGPT, Cloudflare, hosted authentication, telemetry or automatic updater in this runtime. Local mode opens no listener. A separately provisioned production host owns its SQLite database, users, assets, feed credentials, command history, scores and clocks.

## Set up a production host

1. Open **Connections** (also available before sign-in). In Local mode, sign in as a local administrator if one has already been created.
2. Under **Host on this PC**, choose whether to listen on this PC or the LAN, then **Create production server**. This creates a separate database location and a private, two-year TLS certificate. It does not copy the local workstation's users or projects.
3. **Start server**, then connect to the automatically saved profile. On the server PC, create its first administrator and a personal passphrase. There is no default account/password. Remote first-admin setup is blocked without the bootstrap secret, which stays in the protected host folder.
4. Transfer projects with **Export / Import** and create users/grants in **Accounts & access**. Assign each operator's workspaces and permissions on this server.
5. On another PC, install BroadcastCG 0.8.0. Add a named profile with `https://SERVER-PC:9443` (or its LAN IP) and the host's SHA-256 fingerprint. Verify the fingerprint directly on the host; **Test connection**, **Save profile**, then **Connect & sign out**. Sign in with a server account.

The host defaults to port 9443. This release's provisioning accepts other ports through the native host interface; the UI uses 9443. A stopped host can switch between loopback and all IPv4 interfaces using **Enable LAN listening / Limit host to this PC**. Configure a private-network inbound TCP rule in Windows Firewall for the selected port if another PC cannot connect. No firewall rule or public port forwarding is installed automatically. **Test connection** reports a verified protocol response and round-trip latency.

The private server folder is `%APPDATA%\BroadcastCG\production-server`; local mode retains `%APPDATA%\BroadcastCG\data`. The server folder's ACL is restricted to the Windows user, administrators and SYSTEM. Feed credentials use AES-256-GCM with a server-specific key. The certificate pin is checked before sending any HTTP credentials. Passwords and bearer tokens stay in Electron main; tokens are hashed in the server database. Profile-specific remembered sign-in and recovery drafts use Windows DPAPI on each client.

## Running the host

**Start server** runs the bundled runtime as a hidden background process; no separate Node or database installation is required. It continues after the editor closes. **Start at sign-in** launches the desktop and its configured host at Windows sign-in. It is a user process, not a registered Windows service. **Stop server** checkpoints storage and interrupts active commands without replay. Sign in locally to administer this host.

For unattended operation before Windows sign-in, the installer also includes a ServiceBase host and an explicit administrator installer at `<installation>\resources\server-tools\install-service.ps1`. After provisioning and setting up accounts, disable user-host startup and stop it. In an **administrator PowerShell** run:

```powershell
& '<installation>\resources\server-tools\install-service.ps1' `
  -ApplicationDirectory '<installation>' `
  -ServerDirectory "$env:APPDATA\BroadcastCG\production-server"
```

It creates new, protected `%ProgramFiles%\BroadcastCGProduction` and `%ProgramData%\BroadcastCG\Production` folders, copies the stopped host, and registers `BroadcastCGProduction` under **LocalService**, with delayed automatic startup and bounded crash recovery. It refuses an existing destination/service. The service executes only its protected runtime and bundle; it does not accept script paths over IPC. Manage that host in Windows Services. The desktop host buttons continue to manage the separate per-user host, so keep that host stopped. Service install/upgrade/uninstall recovery is not yet qualified; do not install the SCM host for a live show before testing it on the intended server. This development session has a non-administrator Windows token, so SCM registration was not performed.

## Shared state and ownership

- Authenticated WebSocket snapshots publish accessible workspace revisions, ownership and output status. The client synchronizes clean editors; a dirty editor preserves its draft and displays a conflict. **Export** the draft before **Use latest server version** if you need to retain it. Server revision checks reject stale saves.
- Counter deltas apply to the latest server value atomically. Commands retain their IDs and outcomes. Simultaneous active sequences are rejected by the existing workspace reservation rather than queued or silently repeated. Absolute assignments and sport operations still require a current revision.
- **Request control** acquires a free workspace or alerts the owner. **Release control** hands it back. Engineers/admins can **Take control** only when no sequence is active, and choose **Require ownership**. Ordinary operators cannot steal an owned workspace. Leases expire 15 seconds after renewal stops and are never restored after restart; ownership policy persists. Locks cover whole workspaces, not individual panels.
- Losing the stream disables mutations. Reconnection reads current state with a new epoch/sequence; it never resubmits a TAKE, CLEAR, increment or macro. If a response is uncertain, inspect **Execution history** before issuing another action. Editor drafts are encrypted on that workstation even while its network is unavailable.
- Network polling does not extend account idle expiry. A server account can still expire or be revoked. Production clocks continue on the server while the client is disconnected; they pause at the latest checkpoint after host restart.

## Output

On the intended output PC, sign in with **Configure output displays** permission, **Open output**, then choose **Attach output on this PC** in Connections. Only one output workstation can be attached. Other clients may monitor the current program but cannot acknowledge commands or edit through the output window.

A TAKE succeeds only after the attached native renderer acknowledges the exact revision after two animation frames. Timeout/disconnection is **unconfirmed**, not success. Closing output or signing out releases the attachment. A dedicated output workstation needs an active signed-in session; session expiry/revocation prevents further TAKEs until it signs in and attaches again. An already displayed graphic remains visible. On connection loss, the last received graphic remains (an in-progress animation may finish; clock values stop refreshing). A restarted/replacement server never automatically reattaches output or replays its program. Attach deliberately, inspect state and issue a fresh command when appropriate.

Acknowledgement verifies rendering, not physical scanout, remote font/image readiness, SDI/NDI, genlock or a measured frame-latency budget. There is one program/output channel. Use **System → Export diagnostic report** for active-server status, connected-client count, engine owner, storage integrity and command/audit events. Certificate keys, passwords and feed headers are excluded.

## Backup server and recovery

While connected as an engineer/admin with system permission, enter a 15–128 character backup password and **Save server backup**. A consistent SQLite snapshot plus the feed encryption key is protected with scrypt and AES-256-GCM in `.bcserver`. It includes accounts, projects and embedded assets. Keep the password: it cannot be recovered. The current qualification limit is 200 MB.

On the backup PC, provision a host and leave it stopped, then use **Restore stopped host** in Local mode. The reviewed restore accepts `.bcserver` or `.bcbackup`, retains an existing database for rollback, checks integrity and revokes sessions. Its own TLS certificate and bootstrap identity remain intact. Start it, verify the fingerprint and save its profile on operator PCs; select it as **Backup server**.

Failover is **manual**, with no live replication, automatic promotion or split-brain fencing. Stop/isolate the failed primary, close the current output window, and choose **Switch to backup & sign out**. Sign in, inspect recovered project and command state, open/attach output, and issue a fresh TAKE only after review. Work since the snapshot may be absent. Switching does not merge databases or carry unsaved edits/actions to another authority.

## Qualification and remaining work

Phase 8 qualification included 112 automated tests, including pinned TLS before credential transmission, two independent clients, stale edits, counter deltas, lease permissions/expiry, duplicate TAKE protection, missing acknowledgement, disconnect/restart and encrypted recovery with revoked sessions. Native Electron QA exercised saved profiles, a separate bundled background server, real output acknowledgement, a second client, live editor synchronization and dirty-draft conflicts. Screenshots were inspected. Local mode, PSD/AE conversion and sports regressions also passed.

These tests use separate processes/clients on this Windows 11 PC. Physical multi-PC LAN/firewall qualification, the elevated SCM install, long-duration/GPU stress tests and broadcast hardware remain unverified. Adobe plugin qualification is deferred at the user's request. Phase 9 adds [access periods, managed recipient setup, portable packages and recovery](DEPLOYMENT-AND-ACCESS.md). Public code signing and a physical Windows device matrix remain unqualified. Phase 10 covers output SDKs and production qualification.


## Phase 10A browser receiver

Version 0.10.0 can attach a ready local OBS Browser Source receiver instead of the desktop output window. Start it in **Broadcast output** on the output PC, load the URL in OBS, then attach this PC here. TAKE waits for that receiver; a desktop monitor cannot substitute its acknowledgement. Stop releases the output attachment. See [output setup and precise failure behavior](BROADCAST-OUTPUT.md). The bridge itself listens on loopback only; remote operators still use the pinned HTTPS production server.
