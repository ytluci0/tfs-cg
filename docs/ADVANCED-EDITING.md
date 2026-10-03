# Advanced editing — BroadcastCG 0.18.0

All tools run locally. Editing and restoring a version never sends a TAKE. Project changes use the same renderer for canvas, thumbnails, still export and output.

## Canvas

- Select a layer to see eight resize/stretch handles, a rotation handle above it, and an orange anchor point. Drag the anchor to reposition the pivot while keeping the artwork in place. Shift constrains proportions or rotation; multi-selection resizing preserves proportions. Transform together within the same group. Locked layers are excluded.
- Dragging previews locally until release. One completed gesture is one Undo step. Escape, pointer cancellation or lost capture cancels it. Animated values use the playhead; fixed values remain fixed. In Design, existing animation tracks move with the artwork.
- Object edges, centers and guides attract a moved layer. Hold Alt to bypass smart snapping. The existing grid selector remains available for direct layer dragging.
- Turn on **Rulers**, then drag from the top or left ruler to place a guide. Drag a guide to adjust it; drag it outside the canvas or double-click it to remove it. Guides are editor aids and do not appear on output.
- Choose **Pen path (P)**. Click for corners or click-drag for curved handles. Add more points, choose open or closed, then **Finish path** or Enter. Escape cancels. **Edit path points & handles** provides smooth/corner points, insertion and removal. Alt separates opposing handles.
- Select two or more static shapes in one group and use **Combine shapes → Union / Subtract upper shapes**. Subtraction uses the lowest selected shape as the base. Referenced, masked or animated shapes must be detached first. The resulting compound keeps its individual paths in project data and can be undone.

## Text, effects and compositions

- **Text layout & animation → Edit text on canvas** opens the text editor over the workspace. Select a range and apply its font, size, color, bold, italic or underline. Apply commits one edit; Cancel/Escape discards it. Replacing text clears character-range formatting. Set paragraph spacing, wrapping, letter spacing and automatic/LTR/RTL direction in the inspector.
- Text animation supports letters, words or lines, with fade, slide, reveal or typewriter effects, a start time, duration and stagger. Use line animation for connected scripts where preserving word shaping matters.
- **Effects stack** adds brightness, contrast, saturation, hue rotation, blur, shadow and outline. The list order is the processing order. Toggle an effect to bypass it, use arrows to reorder, or remove it. Effects preserve source images and existing masks.
- **Composition…** inserts another scene as an animated instance. Edit the source scene to update its instances. Override its `{{variables}}` per instance, including text, photo asset URLs and colors. Time offset, speed and looping are independent per instance. Cycles and nesting beyond four levels are rejected; expanded compositions are bounded to 1,000 layers.
- Output receives a snapshot of the source compositions when TAKE/Update live runs. Editing a source scene does not change an already acknowledged graphic.

## Motion

- **Motion path → Add motion path → Edit route on canvas** creates an editable route offset from the layer's position. Drag route points/handles, insert points, and choose smooth or linear speed, looping and optional direction following.
- A layer with a motion path exposes **Path progress** in its expanded timeline. Keyframe that property to control acceleration, pauses and reverse movement along the route.
- Open **Graph editor** below the workspace. Choose a property and inspect its value or speed curve. Double-click the value graph to add a key; drag a key in time and value. Dragging snaps to the scene frame rate and commits one Undo step. Segment easing controls and the timeline's Bezier editor adjust interpolation.

## Media and versions

- **Media library** shows accessible local images and videos. Search by name, folder or tag; import files; drag an asset onto the canvas or double-click to insert it. Organizing assets does not move or delete their files.
- **History** in the project bar shows labeled session steps with thumbnails. Restore a step to create a new Undo entry.
- Name a version and choose **Save snapshot** to keep it across restarts. The project is saved first and the service checks its revision. Each project holds up to 20 named snapshots. Assets referenced by snapshots remain available to users who retain access to that project. Restoring uses the normal project permission and save checks.

## Button artwork

In **Panels → Design button visually**, set **Transition (s)** and linear/smooth easing. Normal, hover, pressed, live and disabled states interpolate geometry, opacity and fixed hexadecimal colors. State changes do not run control actions by themselves. Tick visual layers to align/distribute them or match widths/heights; one selected part aligns to the button canvas.

## Compatibility and release checks

New project fields are optional; old projects retain their data. Local database schema 8 prevents older applications from opening and silently stripping the added editing fields. A consistent schema-7 backup is created before migration. Keep that backup with the previous application installer for rollback.

These are native BroadcastCG editing tools, not complete Photoshop/After Effects parity. Existing Adobe conversion limitations remain. Configurable 60 fps is retained; renderer acknowledgements and software tests do not establish physical output timing or hardware frame locking.
