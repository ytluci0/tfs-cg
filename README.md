# BroadcastCG — local Windows desktop

BroadcastCG has a local Electron desktop build using the existing graphics editor, animation tools, panel builder and sports/esports controls. It runs without ChatGPT, Cloudflare or an internet connection. Optional production mode hosts HTTPS on your own PC or LAN server. The optional browser output bridge listens only on this PC. External feeds/images require a connection only when configured by the operator.

Version **0.11.0 adds direct NDI output** from Phase 10B: transparent 720p/1080p graphics, a separate native sender, frame submission health and receiver counts. Open **Broadcast output** to start a named NDI source using your installed runtime. Existing TAKE, Update, Hide, macros and self-hosted operator controls work with this engine. Read the [NDI setup and qualification guide](docs/NDI-OUTPUT.md). The [OBS Browser Source adapter](docs/BROADCAST-OUTPUT.md) remains available. SDI/genlock and physical multi-PC qualification remain outstanding.

Timed accounts, managed recipient setup, portable `.broadcastpkg` projects, encrypted backups and editor recovery remain available. Read the [deployment, access and recovery guide](docs/DEPLOYMENT-AND-ACCESS.md).

Phase 8 LAN production, PSD import and supported AE conversion remain available. Adobe plugin work is deferred. The installer remains unsigned pending a publisher signing certificate; a physical device qualification matrix and broadcast hardware validation remain outstanding.
