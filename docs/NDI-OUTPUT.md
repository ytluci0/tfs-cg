# Direct NDI output — 0.11.0

This release adds the NDI adapter from Phase 10B. BroadcastCG renders the current
graphic locally and submits video with alpha to the installed NDI runtime. It
does not need OBS, cloud hosting or an external Node installation. An installed
NDI 6 runtime is required; the installer does not distribute NDI Tools or the
proprietary runtime. [NDI information and downloads](https://ndi.video/).

## Use it

1. Sign in, open **Broadcast output**, and select 720p or 1080p, an integer
   25/30/50/60 fps rate and a transparent or solid background.
2. Enter a name under **Direct NDI output** and select **Start NDI output**.
   Stop an existing browser/NDI output before changing engines or formats.
3. Select the displayed computer/source name in an NDI receiving application.
   Discovery can take several seconds. The sender health panel reports connected
   receivers separately from sender readiness.
4. Use your existing TAKE, Update, Hide, buttons, macros and data bindings. The
   desktop output window may stay open as a monitor. **Hide and verify your
   receiver before Stop output** if the downstream graphic must be cleared;
   receivers can hold their last frame after a sender disconnects.

For self-hosted production, connect the output PC to your server, start NDI there,
then **Connections → Attach output on this PC**. Release the attachment before
switching engines. Output configuration requires the same engineer permission as
other outputs. Viewers cannot configure NDI or retrieve its internal renderer URL.

NDI advertises its source on the local network. Receiver access is governed by
your NDI/network configuration, separately from BroadcastCG operator accounts.
BroadcastCG does not change Windows firewall rules. Account logout or expiry
locks controls while output may retain the last graphic.

## What the indicators mean

- **Sender ready** means the renderer and local NDI helper are healthy. A receiver
  is not required to prepare a source; check **Connected receivers** independently.
- **Last TAKE submission** measures rendering preparation, capture and the return
  from the synchronous NDI send API for that revision. It is not a remote on-air
  acknowledgement or physical display latency measurement.
- **Frames submitted** and **Average submission rate** come from the native helper.
  The NDI SDK paces submissions at the selected integer rate. Static images are
  repeated; **Repeated frames** is therefore not a dropped-frame counter.
- **Replaced queued paints** counts renderer images superseded by a newer image
  while the sender was busy. Memory is bounded to one in-flight frame and one
  queued frame. A confirming command frame cannot be displaced by an animation.

The hidden renderer is sandboxed and has no account or database API. Its
premultiplied BGRA pixels are converted to straight alpha in a separate x64 helper
before synchronous NDI submission. Browser render acknowledgement alone cannot
confirm an NDI TAKE. A stale helper/renderer, crash or timeout blocks new TAKEs;
an uncertain command is never retried automatically. Restart is manual and begins
with transparent video, without replaying the previous program. NDI has no audio
in this release. Fractional rates, interlaced output, HDR, 4K NDI, SDI, hardware
fill/key, genlock and redundant playout remain outside this adapter.

## Qualification and next work

The developer qualification runs an independent native NDI receiving process. It
checks decoded pixels, dimensions, frame rate, 50% alpha/color, Hide, animated
samples, receiver reconnection and an empty restart. Native application tests
also exercise permission checks, engine changes and exact-revision submission.
The installed-build test exercises a separate operator and HTTPS server through
the packaged renderer/helper to an independent decoder. Test profiles are separate
from the owner's application data.

Results are recorded in `desktop/release/ndi-qualification.json`. Qualification on
one Windows PC does not prove physical multi-PC network performance, interoperability
with every mixer, all-day stability or hardware timing. No DeckLink, UltraStudio
or AJA device was found in the Windows device inventory during this release.
SDI/genlock and physical receiver/network qualification remain the next work.
Adobe plugins remain deferred. The Windows installer remains unsigned.

Measured on 1 October 2026 with NDI runtime 6.2.0.3 and the RTX 3070 Ti:

| Check | Result |
| --- | --- |
| Final 1080p50 run | 300.011 seconds; 14,801 decoded frames after discovery |
| Measured receiver cadence | 49.9993 fps; zero receiver queue drops |
| Renderer | 15,495 updates over 309.911 seconds; zero late callback intervals |
| Sender, including reconnect | 15,504 submissions; 268 repeats, including startup/Hide; 21 replaced queued paints |
| Alpha | Decoded center BGRA 64, 32, 223, 128 for requested half-opacity #e02040 |
| Failure/recovery | Hide, receiver reconnect, empty restart and sender crash passed |

The scene contains 32 animated shapes and a half-opacity reference rectangle.
Discovery took approximately four seconds; that startup is excluded from the
active receiver cadence calculation. These numbers describe this generated test,
not a guarantee for every project or receiving application.

Implementation references: [NDI sender API](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-send),
[frame formats and straight alpha](https://docs.ndi.video/all/developing-with-ndi/sdk/frame-types),
[Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering).
NDI is a registered trademark of Vizrt NDI AB. Interface notices are included in
`desktop/assets/NDI-NOTICES.txt`.
