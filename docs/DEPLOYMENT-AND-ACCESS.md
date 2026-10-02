# BroadcastCG 0.9 — access periods and recovery

The current desktop release opens the [Project Library](PROJECT-LIBRARY.md) after sign-in. Use project cards to enter an editor and **← Projects** to save and return to the library.

## Give someone access for a fixed duration

1. Open your self-hosted production server in **Connections**. Accounts belong to the currently selected authority; a local-workstation account is separate from a server account.
2. In **Accounts & access → Add user**, choose a username, temporary passphrase, role and assigned workspaces.
3. Set **Access starts** and **Access expires**, or choose **7 / 30 / 90 / 365 days from now**. Blank expiry means unlimited. Date fields display this PC's timezone; duration presets use the server's reported time.
4. Install BroadcastCG on the recipient PC and connect it to your server. The recipient changes their temporary password at first sign-in.
5. The server rejects expired accounts, revokes sessions and remembered sign-ins, and disconnects active clients. A running sequence stops before further effects. Previously completed actions remain applied. The existing output graphic is held; expiry does not deliberately cut a broadcast to black.
6. Use **Edit access → Renew +30 days** or choose a new date to renew. Access edits sign the user out, so they sign in again afterward. **Account enabled** can disable access immediately.

At least one enabled administrator must have unlimited access. A time-limited administrator cannot grant access beyond their own deadline, remove their own expiry, or reset a longer-lived owner's password. Recovery administration requires both account/system administration permissions and unlimited access.

## Recipient installation that requires your server

On the owner PC, open **Connections**, enter a server profile using its reachable LAN address or private VPN hostname and certificate fingerprint, then choose **Export managed client setup**. The kit contains a public `.bcclient` configuration, an installation script and instructions; no passwords are included.

On the recipient PC, install 0.9 or later. A Windows administrator runs `Install-ManagedClient.ps1 -Configuration .\production.bcclient` from the exported kit. The script creates a protected policy at `%ProgramData%\BroadcastCG\managed-client.json`. Restart the app.

Managed mode removes Local workstation, profile editing and hosting controls. Only the assigned servers are available. The editor is blocked while disconnected and reconnects without replaying commands. Invalid policy prevents startup instead of enabling local mode. Applying a kit does not create accounts or expose ports. The server must remain reachable over the LAN or your private VPN; there is no hosted licensing service.

This is server account enforcement, not tamper-proof offline licensing. A Windows administrator can remove the policy or replace the application. Exported projects and images are not remotely revoked. The owner's installation is not automatically placed in managed mode.

## Portable project packages

**Export** now writes `.broadcastpkg`. A versioned manifest contains SHA-256 checksums for the complete supported project and every embedded local PNG/JPEG/WebP image. The project includes graphics, keyframes, groups, variables, panels, macros, component library, formations, rosters and sports/esports configuration.

**Import** verifies checksums and required images before writes, reviews external URLs and font-family requirements, then saves a new workspace and remapped images in one transaction. Existing workspaces and output are unchanged. Legacy `.broadcastproject` and raw project JSON remain readable.

Font files, video files, arbitrary Adobe plugins and external feed credentials are not embedded. Install the required fonts and configure credentials on the destination. A checksum detects corruption; it is not a publisher signature.

## Backups and restore

Open **Backups & recovery** with an unlimited administrator account. Choose a 15–128 character backup passphrase, enter a label and select **Create backup**. **Verify** checks the password, authenticated encryption, database integrity, schema, relationships, project documents and encrypted credentials. **Export** saves a `.bcbackup` copy. There is no automatic retention deletion; keep an exported copy on another disk.

Backups include accounts and password hashes, account deadlines, project data, images, draft recovery, command history and feed credentials. Feed secrets are re-encrypted under a portable key inside the password-protected backup. The backup password cannot be recovered. `.bcserver` backups remain supported.

For local restore, close output and finish/cancel active sequences. Select **Restore local workstation…**, choose a file, verify it and review the replacement dialog. The app preserves the original SQLite database under `rollback-*.sqlite`, revokes restored sessions and remembered tokens, re-protects feed secrets using this Windows account, and returns to sign-in. Use credentials contained in the backup. This PC's connection profiles, startup preferences and window placement are retained.

For a server restore, open the app on the host in Local mode, stop the host under **Connections**, and choose **Restore stopped host**. A reviewed restore can replace an existing stopped host or populate an empty one. The server keeps its own TLS identity and re-encrypts restored feed credentials under its own key. Its prior database is retained. Starting the host does not replay TAKE or sequences.

A restore journal handles interruption before or during database promotion. An unconfirmed replacement is rolled back at next startup where an original database exists. Interrupted replacement files are retained for inspection. Successful restores retain their rollback database; this recovery snapshot remains protected by the data folder's OS permissions rather than a separate backup password.

## Upgrades and rollback

Automatic updates remain disabled. There is no cloud update connection. Before upgrading, create, verify and export an encrypted backup; close output and the app; retain the earlier installer. Install the new release and verify the account/project list before production use.

Upgrading 0.8 to 0.9 creates a consistent `backups/before-access-periods-*.sqlite` snapshot before schema 7 adds account dates. Earlier releases cannot use schema 7. To roll back, close the app and restore the matching earlier database together with the earlier application release. Retain the newer data separately. Do not point an older release at the newer live database or copy a running SQLite file without its checkpointed contents.

This release is unsigned. A publisher code-signing certificate is required for publicly signed installers. The build can use electron-builder's configured signing credentials when the owner supplies them; none are included or created automatically.

## Editor recovery and validation limits

The last workspace, Design/Animate/Data/Panels/Sports/On-air view, selected scene, timeline position, selected panel, Build/Operate mode, zoom and selected controls are remembered per account and server on this PC. Existing draft recovery and monitor-aware window placement remain available. Playback, TAKE, sequences, output attachment and running clocks are never restored as actions.

Qualification uses isolated profiles on this Windows 11 PC, bundled Electron/SQLite, native dialogs and UI, a separate server process, two clients, password-protected backup restore, account expiry/renewal, data migration and an installed-executable check. Tests never adjust the Windows clock. A clean Windows 10/11 device matrix, physical multi-PC LAN, elevated SCM service registration and the protected managed-policy installation on a recipient PC remain separate qualification tasks. Adobe plugin work remains deferred.
