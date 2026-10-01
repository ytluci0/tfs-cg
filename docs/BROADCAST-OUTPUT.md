# Phase 10A — local broadcast output (0.10.0)

BroadcastCG can send transparent graphics to **OBS Browser Source on the same Windows PC**. This is the first external output adapter. Version 0.11.0 also adds [direct NDI output](NDI-OUTPUT.md). SDI cards, genlock, redundant engines, audio and hardware fill/key are not implemented. Phase 10B remains equipment and physical network qualification; this release does not claim full broadcast qualification.

## Operate it

1. Sign in and open **Broadcast output** in the desktop strip. Configuring output requires **Configure output displays** permission; viewers with output viewing permission can inspect health but cannot obtain the URL or change settings.
2. Select resolution, target frame rate and transparent or solid background. The initial preset is **1920 × 1080, 50 fps**. Start browser output. Settings persist, but the bridge and program never automatically start after an application restart.
3. In OBS add a **Browser Source**, paste the copied URL, set the matching width/height, enable custom FPS and use the selected frame rate. Leave **Shutdown source when not visible** and **Refresh browser when scene becomes active** off. A size mismatch prevents Receiver ready.
4. Alternatively, enable OBS's WebSocket server under **Tools → WebSocket Server Settings**. In BroadcastCG enter its local port and password, connect, select a destination scene and a unique source name, then **Add Browser Source**. The source is added hidden unless you select the immediate-enable checkbox. Existing sources are not overwritten and scenes are not switched. BroadcastCG never starts OBS streaming or recording.
5. Wait for **Browser receiver ready**, then use the usual TAKE, Update and Hide controls. Existing buttons, macros, sports scores, data bindings and animations use this engine. If a native output window is open it is a monitor; it cannot confirm a browser TAKE.
6. In LAN production, run this bridge and OBS together on the output PC, connect BroadcastCG to your self-hosted server, and use **Connections → Attach output on this PC**. Operators can control that output from other clients. Only the attached workstation confirms commands. Stop/release output before switching authorities or restoring backups.

The source URL is read-only but private: anyone on this Windows PC who possesses it can view the current program and its embedded images. It is not an account token. It is protected with Windows DPAPI on disk, omitted from diagnostic exports and never sent to a hosted service. Do not paste it into public websites. The listener binds only to `127.0.0.1`; no firewall rules or LAN HTTP listener are installed. An ordinary browser opened to that URL becomes the receiver, so do not open a second copy while OBS is using it.

OBS references: [Browser Source properties](https://obsproject.com/kb/browser-source), [WebSocket protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md). Other HTML-capable mixers may accept the URL, but **vMix and other receiving applications have not been qualified**.

## Acknowledgements, timing and failure behavior

The bridge runs as a separate local process, without database or account access. Only the dedicated output bundle, current immutable program snapshot and referenced PNG/JPEG/WebP images are available. It refuses writes, arbitrary file paths, foreign origins and duplicate receivers. The editor's database work does not run in this process or in OBS's rendering process; that separation is not a guarantee of command latency under heavy database load.

A new TAKE waits for image decoding, completion of font loading (fallback fonts can still be used), React commit and two receiving-browser animation callbacks. Only the selected receiver's exact revision and matching viewport can acknowledge it. Missing images, a stale receiver, timeout or disconnect are failures/unconfirmed states. Inspect the receiver and command history before issuing a new command; commands are never automatically retried. The acknowledgement measures preparation/rendering, **not OBS composition, an encoded frame, physical scanout or SDI/NDI emission**.

Browser animation elapsed time uses a monotonic clock after synchronization. The renderer limits updates to the configured target; OBS must also be configured for the intended output rate. Fractional rates, interlaced video and frame locking are not supported. Clock variables refresh at up to four snapshots per second. 720p/1080p/2160p and integer 25/30/50/60 presets are available; qualification measurements below apply only to the tested format. No inference of 4K performance is intended.

- A receiver connection loss holds its last rendered state; an animation already running may finish. No error banner is drawn into the graphic.
- A source reload receives the current snapshot with the original animation start, without issuing or acknowledging another TAKE. A lost pending acknowledgement remains unconfirmed.
- Stopping browser output releases the LAN attachment and does not silently fall back to the desktop engine. A still-loaded OBS page can hold its last graphic. **Use Hide and confirm it before stopping when you require transparent output.**
- Closing/restarting BroadcastCG disconnects the bridge. Starting it again presents an empty program until a fresh TAKE. Server restart and server switching retain the existing manual attachment/review rules.
- Account logout/expiry locks controls while the last graphic can remain visible, matching desktop output behavior. Recipient access is not tamper-proof DRM.

## Health and qualification

Receiver health shows actual acknowledgement timing and browser callback telemetry. **Late callback intervals** are estimated scheduling gaps relative to the requested rate; they are not GPU or encoder dropped-frame counts. Average renderer updates and the longest callback interval help find stutter. Optional OBS metrics separately report actual FPS, frames missed by rendering, frames skipped by encoding and average composition time. OBS connection is manual; credentials are not persisted by BroadcastCG.

Automated checks cover protected HTTP/WebSocket routing, one receiver, exact acknowledgements, timeouts, missing images, disconnection, wrong viewport, snapshot reconciliation, no replay, format bounds and OBS protocol behavior. Native checks cover the narrow permission-controlled bridge, transparent output, Hide, receiver loss, observer isolation, and a server TAKE from another client through the browser receiver.

The local OBS qualification uses a separate portable copy of the installed OBS executable and a generated QA profile; it does not change the user's OBS scenes, profiles or streaming destinations. A 1080p50 scene with 37 layers, an embedded image, animated shapes and changing text is exercised for five minutes, with source screenshots checking transparency/image pixels, missing-image rejection and source reload. No stream or recording is started, so there is **no encoding or network transmission qualification**.

Measured on 1 October 2026, Windows 11, NVIDIA RTX 3070 Ti, OBS 32.2.2:

| Check | Observed result |
| --- | --- |
| Automated suite | 135 passed |
| Native application checks | 28 passed, including a second operator → server → browser receiver |
| Final soak | 300.637 seconds, 59 changing TAKEs plus live variable updates |
| OBS frames | 15,032; zero missed rendering frames; reported 50 fps |
| Bridge → receiver acknowledgement | 60 samples; 62.6–184.2 ms; 95th percentile 83.2 ms |
| Browser scheduling | Zero late callback intervals in the final run |
| Pixels/failure checks | Transparent background, decoded image, missing-image rejection, reload and Hide passed |

These are measurements of this small generated workload on one PC, not a performance guarantee or an all-day show test. Full sample traces are retained in the workspace QA cache; `desktop/release/output-qualification.json` contains the release summary.

Remaining Phase 10B work after the NDI adapter: selected SDI adapter and its SDK/device requirements, real recipient/operator/output PCs, long-duration show workloads, GPU/monitor-loss recovery, hardware latency/frame timing, genlock/fill/key and redundant playout. Publisher signing and the clean Windows device installation matrix also remain open. Adobe plugin work remains deferred.
