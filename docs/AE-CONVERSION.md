# After Effects conversion — phase 7

BroadcastCG **0.7.0** adds **Import AE** to the project toolbar. Conversion and playback are local. After Effects is required on the exporting computer; BroadcastCG does not need Adobe installed to import or play an exported package. This is a deliberately limited interchange pipeline, not a general `.aep` reader or an After Effects rendering engine.

## Export from After Effects

1. In BroadcastCG, choose **Import AE → Save AE exporter**. Save `BroadcastCG-AE-Export.jsx` locally.
2. Open a composition in After Effects and set the work area to the animation you want to transfer. Use square pixels and sRGB artwork.
3. Run **File → Scripts → Run Script File**, selecting the saved exporter. If AE blocks file writes, enable **Allow Scripts To Write Files And Access Network** in its scripting preferences yourself. The exporter uses local file reads/writes only; it does not access the network.
4. Save a `.bcae` package. The script inspects the composition without modifying its layers, expressions, work area, render queue or original project. It samples supported transform values and embeds PNG still footage. It reports skipped layers; if no supported layers remain it does not write a package.
5. In BroadcastCG, choose **Choose AE package** and select that `.bcae` file. Raw `.aep` and `.aepx` files cannot be opened here.

Adobe documents the script execution workflow in [Scripts in After Effects](https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html).

## Review and import

- Play or scrub **BroadcastCG result**. Time starts at zero for the exported work area; the corresponding original AE composition time is also shown.
- Render PNG stills in AE at important times, then use **Attach PNG at … s** at the matching work-area time. Up to 20 reference frames are retained. A reference must match the composition dimensions and be a non-interlaced, 8-bit RGB/RGBA PNG. Reference rendering is manual; BroadcastCG does not pretend to render AE effects itself. Choose a reference time to compare matching frames. Scrubbing to a different time hides the reference instead of showing a misleading comparison.
- Review installed fonts and substitute any missing families. Fonts are not installed or embedded. Point-text typography can differ from AE even when the font family matches.
- Read the conversion report, including skipped layers, and acknowledge it. **Add AE scene to project** saves current changes and inserts the scene and images in one transaction. A stale workspace revision, active command, expired session or insufficient permissions prevents import. Cancel leaves no imported scene or assets.
- The new scene opens in **Animate**. The inspector retains its **AE conversion report** and reference-time picker. **AE reference** in the canvas toolbar shows an attached frame; **Show design** returns to the editable graphic.

Imported text and images use the same variable placeholders, API data bindings, panels and actions as other graphics. For a custom button, add **Stage graphic** targeting the imported scene, then **Take to Program**. **Hide output** uses the existing clear action. Imported expression results do not recalculate when variables change; bind the text/image content explicitly in BroadcastCG.

## Edit animation

Select a layer in **Animate**. Choose a property, set **Value at playhead**, and choose **Set key**. Existing rows let you edit the exact time, value and outgoing interpolation, or delete the key. Moving a key onto another key replaces it. Tracks are paginated in groups of 20 rows.

The renderer supports position, width, height, rotation, opacity, anchor X/Y and signed scale X/Y. **Anchor, scale & timing** in the inspector exposes transform and layer in/out fields. Scale 1 means 100%. Anchors are measured in local source pixels. Layer out points are exclusive; layers ending at the scene duration hold their final frame on air until hidden, matching the existing broadcast playback model. Layers ending earlier disappear at their out point. In Design, the scene is shown at its final time; use Animate to inspect earlier layers.

AE temporal easing, spatial paths and supported transform expression results are sampled by AE at the composition frame rate, with original transform key times included. The importer removes redundant linear points and preserves declared hold segments. Curves match the supplied sample values; between samples they are piecewise linear. Original AE Bezier handles and live expression code are not retained. A 2D position/anchor discontinuity combined with another smoothly moving channel can differ between sample times. This is not subframe or motion-blur fidelity.

## Supported subset

| Feature | Conversion |
| --- | --- |
| 2D, unparented solid layer | Editable rectangle, color and transform tracks |
| PNG still footage | Embedded local image and transform tracks; no external file dependency after import |
| Static, single-line point text | Editable text using first-character style, fill, font, size, weight, justification and baseline |
| Position, anchor, scale, Z rotation, opacity | Sampled editable tracks; separated X/Y position is supported |
| Layer order and in/out times | Preserved relative to the exported work area |
| Transform expressions | AE samples evaluated results; code is never imported or executed in BroadcastCG |
| Solo, disabled, guide and null layers | Visibility respected; omitted layers noted |
| Reference PNGs and conversion notes | Stored with the scene and included in complete project exports |

Unsupported layers are skipped with a report: 3D, parenting, cameras/lights, adjustment layers, non-normal blending, track mattes, masks, enabled effects/plugins, layer styles, auto orientation, shape paths, precompositions, video/sequences and animated text content/styles or text animators. Complex typography, paragraph/multiline text, italic/stroked text and altered text metrics require artwork conversion. Mixed character styles are reduced to the first-character style with an explicit warning. There is no automatic flattening, video fallback, precomp expansion, vector conversion, Photoshop/AE effect engine or audio playback in this phase. Prepare PNG artwork or rebuild unsupported elements as supported layers before exporting.

AE color management, ICC profiles, HDR and motion blur are not reproduced. PNG metadata is stripped and pixels are treated as sRGB. Use reference renders to review visual differences. The canvas background itself is transparent; add a solid layer if a background must go on air.

## Format, limits and persistence

`.bcae` is UTF-8 JSON with `format: "broadcastcg-ae"`, `version: 1`, exporter metadata, composition dimensions/frame rate/work-area timing, bottom-to-top layers, sampled transforms, embedded PNG assets, optional reference times and warnings. Its authoritative schema is [`lib/ae-model.ts`](../lib/ae-model.ts). No paths, URLs, scripts or arbitrary layer commands are interpreted from this format. Packages with unknown fields, duplicate IDs, missing/unused assets, invalid values or inconsistent timing are rejected.

- Canvas 100–7680 × 100–4320; square pixels; 1–120 fps; duration 0.1–600 seconds.
- Up to 250 exported layers, 18,001 samples per layer including the endpoint, 100,000 total transform samples, and 1,000 keys per property after simplification. Export shorter work areas when needed.
- Package up to 80 MB; PNG up to 10 MB each, 55 MB combined, 256 MB declared decoded pixels; no interlaced, palette, animated or 16-bit PNGs.
- Existing limits remain: 100 scenes/project, 250 render layers/scene, 1.5 MB project JSON, 100 MB complete project export. A converted scene is limited to 1.4 MB before commit; the current project's remaining capacity is checked transactionally.
- File reading and image validation run in a bounded worker with a 60-second timeout. Prepared reviews expire after 20 minutes, cancellation, another AE import, sign-out or session revocation. SQLite insertion is synchronous in the native process and has not been qualified for live-production latency; prepare imports before going live.
- Schema 6 is a compatibility barrier protecting new transform/timing/reference metadata. Upgrading schema 5 creates `backups/before-ae-*.sqlite` first. Older-version upgrades keep their existing pre-migration snapshot. Never downgrade a migrated profile; older apps refuse the newer schema.

## Verification and remaining qualification

Tests cover exact sampled values, pivot/negative-scale transforms, hold jumps, point-text baselines, input/PNG limits, malformed manifests, font reports, references, atomic rollback, revision conflicts, permissions, revoked sessions, one-time reviews, timeout/cancellation, complete exports and schema-5 migration. The exact distributed JSX is exercised against a simulated AE scripting contract, including work-area timing, separated position, expression-result sampling, text escaping, PNG embedding and cancellation.

Native Electron QA exercises the real picker IPC and worker, exporter saving, installed-font enumeration, playback, independent raster assertions for a generated moving rectangle, reference attachment, cancellation, keyframe editing, variable-bound text, custom-button TAKE, persistence and compact-window layout. Synthetic references are test fixtures, not Adobe renders.

**After Effects is not installed on the development workstation. The exporter has not been executed inside Adobe After Effects, and no real AEP/reference-render fidelity test has passed here.** Validate representative compositions on a licensed AE workstation before production use. Production timing/soak/hardware qualification remains phase 10.
