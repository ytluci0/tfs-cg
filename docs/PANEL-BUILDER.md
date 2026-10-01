# Panel builder — phase 3

For the added button state designer, press/release/hold actions, conditional controls, API/roster selectors and linked component appearance updates in **0.12.0**, see [Advanced design and control builder](CREATIVE-TOOLS.md). The snapshot workflow below still applies to **Add**; choose **Add linked** for shared styles.

BroadcastCG 0.3.0 runs locally. Open **Panels → Build** with an Administrator or Designer account to edit a panel. Operator accounts can use its connected controls in Operate; Viewer accounts remain read-only. Account overrides still apply.

## Build a production panel

1. Choose a panel or click **+ Panel**. Choose **Free layout** in Panel settings for a canvas with exact positions. Existing grid panels keep their layout until converted. **Edit football layout** turns the existing football scoreboard, pitch and benches into movable controls.
2. Add tools from **Tool library**, including existing sports/esports packs, or the controls on the left: buttons, counters (+/−), text/numbers, dropdowns, segmented choices, toggles, clocks, colors, sliders and formation selectors. Pitch, scoreboard, bench, label and image components are also available.
3. Select a control. In its inspector, choose a variable from the data dropdown or create one with the required type. Change its color, label, size, placement, shortcut and action sequence. Sports widgets have **Data connections** for their field mappings. Formation selectors use the built-in formations and custom shapes created under **Formations**.
4. Drag controls to position them. Shift-click adds/removes selections; drag empty canvas space to draw a selection rectangle. Clicking a grouped control selects the group. Alt-click selects one member. Hidden controls remain visible as faded tiles in Build.
5. Use **Group / Ungroup**, **Align**, **Space**, **Order** and **Duplicate**. Drag the selection corner to scale a group; hold Shift for proportional scaling. Each control stays at least 80 × 64 canvas pixels, and the group stays within the canvas. Overlap is allowed for composed panels; Order controls which tile is on top.
6. Set **Snap** to 4, 8, 16 or 32 pixels, or Off. Hold Alt while dragging to bypass snap. **Fit** scales the canvas to the available editor width; fixed zoom levels provide a scrollable view. Numeric X/Y/Width/Height remain available for a single selected control.
7. The **Controls & groups** list selects controls, names groups, locks their geometry/definition, and hides controls from Operate. Group locks apply to all members. Hidden controls do not run their keyboard shortcut.
8. Open **Validate**. Missing variables, incompatible variable types, missing graphic/API references, invalid data connections and duplicate shortcuts disable affected controls in Operate. Warnings identify empty action buttons and small touch layouts. Validation checks configuration; it does not prove an external feed or output connection is available.
9. Click **Save**, then **Operate**. Positioning and build overlays disappear. Existing bound scores, formation choices, colors, timers and action sequences work through the same project data. Undo changes local editor state; it cannot undo a graphic already sent to Program or an external action.

## Reusable components

Select up to 100 controls, click **Components**, name the component and choose **Save selected**. The library stores relative placement, control configuration, action sequences and referenced variable defaults. It belongs to the project and is included with project exports.

Add a saved component to the current panel to create a new group with fresh IDs and cleared shortcuts. Its controls remain individually editable. The original library entry is a snapshot: editing an instance does not change other copies.

- Leave **Variable prefix** empty to share existing fields. Inserting never resets their current values.
- Enter a prefix such as `match2_` to create separate variable names. Primary control bindings, sports field mappings, action targets, conditions, label/image templates and action-value templates follow the prefix. A type collision blocks insertion instead of changing the existing field.
- Graphics, API sources, formation definitions and player rosters remain project resources shared by the instances. Copying a component does not duplicate graphics or establish a separate match roster. Connect graphics to the prefixed variables when needed.
- Components fit into vacant space; the canvas grows downward when necessary. Increase canvas width before inserting a component wider than the canvas.
- To revise a saved component, edit a placed instance, save it under a new name, and delete the old library entry when appropriate.

## Keyboard and touch

Focus a canvas control with Tab, then Enter/Space to select it. Arrow keys move the selection 1 pixel; Shift+Arrow moves 10 pixels. Focus the selection resize handle and use arrows to resize. Ctrl+A selects visible controls; Ctrl+D duplicates; Ctrl+G groups; Ctrl+Shift+G ungroups; Delete removes unlocked selected controls. Escape cancels an active drag/selection rectangle. Ctrl+Z undoes and Ctrl+Shift+Z / Ctrl+Y redoes; text input keeps its normal undo behavior.

Enable **Touch operation (100% size)** in Panel settings. Operate keeps the canvas at 100% scale with scrolling, and interactive buttons/inputs receive at least 44-pixel targets. Widen or increase control heights when using many quick-score steps, long labels or wrapped choices; Validate supplies minimum-size warnings. The design canvas minimum of 80 × 64 is not a promise that every complex widget fits that space.

## Persistence and limits

Layout metadata is versioned as `layoutVersion: 2`. The enclosing project stays version 1, so older local projects remain readable without a database migration. Version 0.3.0 preserves group membership, locks, visibility, touch mode, snap and component definitions on save/reopen. Zoom and selection are editor-session state. Older app versions do not understand the new metadata; avoid saving a 0.3.0 project from an older version.

Limits: 500 controls and 250 groups per panel, 100 saved components per project, 100 controls per component, 3,840 × 10,000 canvas pixels and the existing 1.5 MB project-document limit. Reusable components are local project snapshots, not a cross-project online library. This phase does not implement PSD/AEP import, game-specific rules, LAN multi-operator synchronization or broadcast hardware integration.

Phase 3 validation includes 11 model/policy tests plus native Electron exercises of selection/grouping, real pointer movement/resizing, locking, keyboard undo/redo, component insertion, touch targets, invalid control disabling and persistence. It also verifies that a running clock no longer prevents autosave.
