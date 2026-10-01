# Photoshop PSD import — phase 6

BroadcastCG **0.6.0** adds **Import PSD** to the top project toolbar. It reads files on this Windows computer; no upload, Photoshop subscription, external converter, cloud account or running Adobe application is needed. The source PSD is read only.

## Import a graphic

1. Open the destination project, then choose **Import PSD**. Select an 8-bit RGB `.psd`.
2. Compare **Saved Photoshop composite** with **BroadcastCG result**. The reference is the composite saved inside the PSD, not a fresh Photoshop render. Enable **Maximize Compatibility** when saving in Photoshop. Convert to sRGB first when color matching matters: embedded ICC profiles are not applied by this importer.
3. Choose a mode:
   - **Editable supported text + image layers**: simple horizontal, uniformly scaled, single-line point text becomes editable text. Other layers use their saved pixel images where available.
   - **Saved layer pixels**: use cached pixels for text too. Layers can still be moved, resized, hidden and animated. If a text layer has no cached pixels, the report identifies its remaining editable text.
   - **Saved Photoshop composite**: one image with the PSD's saved composition. Individual layer contents are no longer independently editable. Color management may still differ from Photoshop.
4. Review installed-font matches, missing fonts and substitutions. Choose an installed family from each field's suggestions. Fonts are not embedded or installed. Mapping does not recreate every Photoshop weight, metric or kerning behavior. When font enumeration is unavailable, the report explicitly says that fonts were not verified.
5. Read the conversion report and choose **Add scene to project**. Existing edits are saved first. The scene and its required PNG assets then commit in one transaction. Import does not stage, TAKE, clear or otherwise change Program.

Cancel leaves no imported scene or images in the database. Inspection has a 180-second timeout. A prepared review expires after 20 minutes, sign-out, cancellation or another import. An expired or revoked account cannot commit it. A command running against the destination workspace blocks import; a stale project revision is rejected.

## Edit the result

The imported scene opens in **Design**. Select its text to change wording, font, color or data-variable placeholders. Image layers use local asset URLs and the existing geometry and animation controls. Use **Animate** to add keyframes to individual layers.

The layer list retains the PSD group hierarchy. Groups can be collapsed, renamed, hidden and given an opacity. Group opacity is applied to the rendered group as a whole. A layer's **Group** dropdown changes membership; layer up/down operates inside its group. Group order follows the first member's position in the layer stack. Empty groups are retained. This phase does not add group transform tracks or vector-path editing.

**PSD reference** in the canvas toolbar toggles the saved Photoshop image for later comparison. **PSD import report** in the inspector retains the conversion notes. The reference image, groups, report and extracted images travel with a complete `.broadcastproject` export. Fonts and the original PSD do not.

## Supported subset and limits

- Names, stacking order, pixel bounds, visibility, basic opacity and nested normal groups are preserved. Pixel alpha is extracted without canvas alpha premultiplication.
- Simple point text uses its baseline transform, solid RGB color, font size, alignment and normal/bold weight. Browser glyph rendering may differ. Mixed styles, multiline/paragraph text, rotated/skewed text, tracking, text paths, warps and italic typography use saved pixels rather than a misleading editable conversion.
- Vector shapes and smart objects use cached pixels; embedded or linked source files are not executed or opened. No editable paths, smart-object documents, linked-file synchronization or Photoshop effects engine is included.
- Masks, clipping, adjustments, non-normal blending, advanced blend ranges and layer effects are reported. Layered modes do **not** reproduce these compositing operations. Pass-through groups become isolated normal groups and can differ. Use the saved composite for the saved appearance.
- Artboards remain on the original document canvas rather than becoming separate scenes. Missing/undecodable layer pixels and omitted layers are explicitly reported. A missing reference disables composite mode.
- Only standard PSD, 8-bit RGB, 100–7680 × 100–4320 canvas pixels, at most 250 layer/group records, and at most 20 levels of groups. PSB, CMYK, grayscale and 16/32-bit files require conversion in Photoshop.
- Maximum input: 2 GB (since 0.13.1). Declared decoded bitmap data: 1 GB. The file header is checked before allocating the input buffer. Import requires free memory for the source plus 1.5 GB of processing/system headroom; close other applications if this check fails. Saved bitmaps are decoded one at a time; unused embedded smart-object source data is skipped. Each bitmap: at most 33,177,600 pixels and 20,000 pixels on either edge. Extracted PNGs: 10 MB each, 55 MB total. Existing project limits remain 100 scenes, 250 render layers per scene and 1.5 MB of project JSON. A complete project export remains limited to 100 MB; very large existing projects may exceed that export limit after an import.

PSD parsing and PNG encoding run in a bounded worker thread, with serialized inspection, declared-size checks, a worker heap limit and termination on cancellation/timeout. SQLite writes remain in the native process, so importing large asset sets has not been qualified for latency-sensitive live production. Save/import before going live. Source files are never modified, and runtime code remains bundled locally.

## Upgrade and verification

Actual Photoshop 2020 Clouds and Solarize filter output has also passed pixel comparison, installed-runtime output, export/import and restart checks. See [Adobe plugin compatibility](ADOBE-PLUGIN-COMPATIBILITY.md) for the exact scope, evidence and repeatable host tests. This verifies baked filter artwork, not native Adobe plugin hosting.

Schema 5 is a compatibility barrier for group-aware projects. Opening an existing schema-4 profile first creates a consistent `backups/before-psd-*.sqlite` snapshot, then advances the marker. Earlier upgrades retain their original pre-migration backup. Do not downgrade a migrated profile to an earlier app; older releases reject schema 5 rather than stripping groups while saving.

Automated tests cover supported text and pixel conversion, default Photoshop metadata, unsupported-feature reporting, format/layer/depth limits, invalid group hierarchies, atomic rollback, stale revisions, revoked sessions, embedded-asset export/import, font reports, worker cancellation/timeout and schema-4 backup. Native Electron QA exercises the actual file-picker IPC and worker using generated PSD fixtures, zero-difference saved-pixel rendering for a simple fixture, review cancellation, local font enumeration, editing and persistence, reference switching, local output acknowledgement and compact-window layout. Additional upstream sample PSDs were inspected for nested groups, masks and complex text. This is not a claim of lossless conversion for arbitrary PSDs or validation against all Photoshop versions.

Parser: [ag-psd](https://github.com/Agamnentzar/ag-psd) 31.0.2. PNG encoder: [fast-png](https://github.com/image-js/fast-png) 8.0.0. Both are bundled dependencies; network access is unnecessary when importing. Native font enumeration uses Electron's `local-fonts` permission for the authenticated editor only. Output windows remain denied access to that permission. After Effects project conversion remains phase 7.
