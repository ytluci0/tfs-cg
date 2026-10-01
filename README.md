# BroadcastCG — local Windows desktop

BroadcastCG has a local Electron desktop build using the existing graphics editor, animation tools, panel builder and sports/esports controls. It runs without ChatGPT, Cloudflare or an internet connection. Optional production mode hosts HTTPS on your own PC or LAN server. The optional browser output bridge listens only on this PC. External feeds/images require a connection only when configured by the operator.

Version **0.13.1 adds the Advanced Design & Control Builder**: gradients, outlines/effects, image cropping/masks, auto-fit text, vectors and multi-layer alignment; Bezier curves, multiple-key editing and named animation cues; button appearance states, press/release/hold actions, IF/ELSE macros, API-fed selectors, searchable rosters, progress/status indicators and linked component styles. Read the [creative tools guide](docs/CREATIVE-TOOLS.md) for where to find and use each feature.

Direct NDI output supports transparent 720p/1080p graphics, a separate native sender, frame submission health and receiver counts. Open **Broadcast output** to start a named NDI source using your installed runtime. TAKE, Update, Hide, cues, macros and self-hosted operator controls work with this engine. Read the [NDI setup and qualification guide](docs/NDI-OUTPUT.md). The [OBS Browser Source adapter](docs/BROADCAST-OUTPUT.md) remains available. SDI/genlock and physical multi-PC qualification remain outstanding.

Timed accounts, managed recipient setup, portable `.broadcastpkg` projects, encrypted backups and editor recovery remain available. Read the [deployment, access and recovery guide](docs/DEPLOYMENT-AND-ACCESS.md).

Phase 8 LAN production, PSD import and supported AE conversion remain available. Adobe plugin work is deferred. The installer remains unsigned pending a publisher signing certificate; a physical device qualification matrix and broadcast hardware validation remain outstanding.

## Reusable graphics and smarter panels

Version 0.13 adds responsive graphic layouts, API row templates, linked graphic components, curved vectors, gradient stops and group transforms; local video/ticker/countdown layers; configurable card/drop/tab widgets; visual action flows with preflighted failure macros; function-key, MIDI and gamepad mappings. See [Production tools](docs/PRODUCTION-TOOLS.md) for controls, limits and qualification details.

PSD import in 0.13.1 supports source files up to 2 GB, with memory preflight, a 1 GB declared pixel budget, a three-minute cancellable inspection, and readable error messages. See [PSD import](docs/PSD-IMPORT.md).
