# Properties inspector

The Design and Animate workspaces share a compact inspector. Select a layer to edit it. The header keeps its name, visibility and lock controls available while the body scrolls. With multiple layers selected, the header identifies which layer these fields edit.

| Tab | Tools |
| --- | --- |
| Transform | Position, dimensions, rotation, opacity, percentage scales, anchor, parent group and responsive layout |
| Style | Contextual text, font, fill, outline, images and crop, effects, shadows, gradients, blending, vector editing and media content |
| Motion | Layer In/Out, presets, transform keyframes, motion paths, text animation and composition playback |
| Masks | Brush/layer mask, shape-mask stack and layer mattes |
| Data | Project-variable dropdowns, property formulas, links and repeated group data |

**Find a property** searches section names and keywords across all tabs. Results open their sections; clear the search to return to the selected tab. Arrow keys move between focused category tabs. The **Scene** button opens scene name, resolution, duration, frame rate, graphic components, animation cues and import reports.

Drag transform values horizontally to preview on the canvas; Shift increases the step and Alt reduces it. Click to type. Escape, lost capture, changing the layer or changing the scene cancels a drag. Release commits one Undo step. Scale and opacity use percentages. In Animate, existing tracks update at the playhead; a diamond explicitly inserts a key. In Design, edits offset the existing animation through the shared editing helper. Formula-driven fields link to the Data tab rather than accepting an ineffective base edit.

Specialist sections start collapsed; their tools continue to use the existing project model and shared renderer. No schema migration is needed. Scene-duration changes keep offscreen animation, consistent with the timeline. Editing or previewing properties never takes a graphic to program. Panel docking, floating, resizing and existing per-project workspace preferences remain available.

Native acceptance: `node desktop/build.mjs` then `node desktop/run.mjs --smoke-test --inspector-only`. This uses an isolated profile and writes a fresh `desktop/.cache/inspector-smoke-result.json`, with screenshots at 1280×720 and 1920×1080.
