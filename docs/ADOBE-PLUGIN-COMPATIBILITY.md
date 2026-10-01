# Adobe plugin compatibility

BroadcastCG 0.7.0 imports Adobe artwork and a supported animation subset. It does not host Photoshop `.8bf` / `.8bi`, After Effects `.aex`, CEP or UXP plugin binaries. PSD is a document format, not a plugin format. A plugin must run in its licensed, compatible Adobe application; its rendered output can then be tested for import.

## Verified on this workstation — 2026-10-01

| Workflow | Result | What remains editable |
| --- | --- | --- |
| Photoshop 2020 / 21.0.0 bundled Clouds filter → RGB 8-bit PSD | Passed actual Photoshop execution, importer, installed 0.7.0 worker, native output, export/import and restart checks | Image position, dimensions, visibility and BroadcastCG animation; filter is baked into pixels |
| Photoshop 2020 / 21.0.0 bundled Solarize filter → RGB 8-bit PSD | Same checks passed | Same raster controls; no editable filter parameters |
| Camera Raw 17.3.1 | File found in the shared Adobe plugin directory; execution not qualified | No compatibility claim |
| Substance 3D Viewer for Photoshop | File found; not qualified with Photoshop 2020 | No compatibility claim |
| AE effects/plugins | Enabled effects are explicitly skipped by the current exporter; a rendered fallback is required | Supported layers without enabled effects remain editable |
| Third-party Adobe plugins | Not qualified; plugin names, versions, licenses and representative output are needed | Depends on whether they produce supported editable layers or rendered artwork |

The two Photoshop tests use new 640 × 360 sRGB documents with a single raster layer. Clouds changed 230,400 pixels and Solarize changed 81,900 pixels compared with their pre-filter images. Both saved layer pixels and saved composites matched separate Photoshop PNG exports with **zero differing channels**. The installed renderer's SVG-to-canvas rasterization also matched both references exactly. Output acknowledgement, complete project export/import with remapped image assets, and an isolated service restart passed. These results do not certify multilayer compositing, all PSDs, other plugin versions, print/HDR color management, alpha edges, or third-party plugins.

Installed archive SHA-256: `6958aff7f8f003924e53f31ffcfeca2b1a6cc6064fbbd3d68d0e2c26748ce4da`.

Evidence is in `desktop/.cache/psd-host-2026-10-01T09-59-22-944Z/`: real Photoshop PSDs and PNGs, `host-report.json`, `pixel-verification.json`, and `installed-runtime-FLtm9e/verification.json` with output captures. Test profiles are separate from the user's BroadcastCG data. Runtime source and the installed 0.7.0 application were unchanged by this qualification.

After Effects is not installed on this workstation. Creative Cloud remains at the Adobe Genuine Service choice; the user must resolve that security/privacy prompt before installation can proceed. No AE-hosted or third-party AE plugin test is claimed as passed. The real-AE qualification kit now includes enabled/disabled Fill-effect diagnostics; that kit still must execute in Adobe.

## Practical workflows

For Photoshop filters that modify pixels, apply the filter in Photoshop and save a standard RGB 8-bit PSD with **Maximize Compatibility**. In BroadcastCG choose **Import PSD → Saved layer pixels**. For smart filters, layer effects, masks or adjustments, use **Saved Photoshop composite** to retain the saved appearance and inspect the reference before TAKE. Composite mode combines the artwork into one image; editable labels and scores can be added as native BroadcastCG layers above it. Preserve the source PSD for future plugin edits.

For an AE plugin that generates editable supported 2D solids, point text or PNG layers and leaves no enabled effect on those layers, use the normal `.bcae` exporter and review the report. For a static effect, render it in AE as an 8-bit RGB/RGBA PNG, use that PNG as a footage layer in a transfer composition, and export the supported layer. Animated plugin output requires an animation/video fallback pipeline that **0.7.0 does not yet provide**. Do not disable an effect merely to silence a conversion warning if its appearance is required.

True augmented-reality graphics would need a separate camera/tracking/3D integration; they are not covered by this Adobe import qualification.

## Repeat the Photoshop tests

1. Run `node desktop/prepare-psd-host-tests.mjs` in the repository. This creates a unique QA directory and a generated `Run-Photoshop-qualification.jsx`.
2. In an empty Photoshop workspace, choose **File → Scripts → Browse** and run that generated JSX. It creates new test documents, applies the actual bundled filters, saves PSD and PNG copies, closes only those test documents, and restores its temporary save-compatibility, dialog and color preferences. Check `host-report.json`; a failed case must not be treated as success.
3. Run `node --experimental-strip-types desktop/verify-psd-host-tests.mjs "<QA directory>"`. It requires successful Adobe execution, checks that filters changed the pixels, and compares the PSD importer output against the independent PNG exports.
4. Run the workspace Electron executable with `desktop/verify-installed-psd-host.cjs "<installed app.asar>" "<QA directory>"`. This loads the actual installed worker, service, preload and renderer, creates a fresh local test profile, imports both modes, checks output and persistence, and writes a separate `installed-runtime-*/verification.json`. It never uses the real workstation database.

## References

- [Adobe Photoshop scripting workflow](https://helpx.adobe.com/photoshop/using/scripting.html).
- [Adobe plugin troubleshooting and shared plugin location](https://helpx.adobe.com/photoshop/kb/plug-ins-photoshop-troubleshooting.html).
- [Camera Raw and Adobe application compatibility](https://helpx.adobe.com/camera-raw/desktop/get-started/overview-and-setup/camera-raw-compatible-applications.html). Installed files alone do not establish a working host/plugin combination.
- [Substance 3D Viewer to Photoshop plugin](https://helpx.adobe.com/substance-3d-viewer/desktop/get-started/photoshop-plugin.html). Adobe documents a Photoshop beta workflow and the end of Viewer support/availability in October 2025; it is not a suitable assumption for a new Photoshop 2020 integration.
