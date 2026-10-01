# BroadcastCG — local Windows desktop

BroadcastCG has a local Electron desktop build using the existing graphics editor, animation tools, panel builder and sports/esports controls. It runs without ChatGPT, Cloudflare or an internet connection. Optional production mode hosts HTTPS on your own PC or LAN server. The optional browser output bridge listens only on this PC. External feeds/images require a connection only when configured by the operator.

Version **0.10.0 adds Phase 10A broadcast output**: transparent OBS Browser Source graphics, a separate local output process, resolution/FPS settings, receiving-browser acknowledgements and performance telemetry. **Broadcast output** also offers optional authenticated OBS setup and composition metrics. It works with local operation and the attached LAN output workstation. Read the [output setup, qualification and limitations](docs/BROADCAST-OUTPUT.md). Direct NDI/SDI, genlock and physical broadcast qualification remain Phase 10B work.

Timed accounts, managed recipient setup, portable `.broadcastpkg` projects, encrypted backups and editor recovery remain available. Read the [deployment, access and recovery guide](docs/DEPLOYMENT-AND-ACCESS.md).

Phase 8 LAN production, PSD import and supported AE conversion remain available. Adobe plugin work is deferred. The installer remains unsigned pending a publisher signing certificate; a physical device qualification matrix and broadcast hardware validation remain outstanding.
