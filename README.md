# BroadcastCG — local Windows desktop

BroadcastCG has a local Electron desktop build using the existing graphics editor, animation tools, panel builder and sports/esports controls. It runs without ChatGPT, Cloudflare, a browser or an internet connection. Local mode opens no network listener; optional production mode hosts HTTPS on your own PC or LAN server. External feeds/images require a connection only when configured by the operator.

Version **0.9.0 adds account access periods and phase 9 recovery tools**. Create users with scheduled access and expiry dates, renew or disable them, and export a server-only managed-client setup kit for recipient PCs. Portable `.broadcastpkg` files include integrity-checked project data and images. **Backups & recovery** creates, verifies and restores password-protected snapshots; interrupted restores retain the previous database. Workspace, panel and timeline positions recover without replaying actions. All operation remains local or self-hosted. Read the [deployment, access and recovery guide](docs/DEPLOYMENT-AND-ACCESS.md).

Phase 8 LAN production, PSD import and supported AE conversion remain available. Adobe plugin work is deferred. The installer remains unsigned pending a publisher signing certificate; a physical device qualification matrix and broadcast hardware validation remain outstanding.
