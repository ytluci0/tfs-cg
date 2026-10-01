# Animation timeline — BroadcastCG 0.16.2

Open **Animate**, then click the arrow beside a layer in the bottom timeline. Each layer expands into Position X/Y, Scale X/Y, Rotation, Opacity, Anchor X/Y, Width and Height. Imported PSD layers use the same controls.

1. Move the playhead using the ruler or the time field.
2. Click a property's stopwatch to enable animation and record its current value.
3. Move the playhead and change the value beside that property. An animated property records a key automatically; an unanimated property changes its fixed value.
4. Click the diamond between the previous/next arrows to add or remove a key at the playhead. Double-click an empty property track to add one there.

Scale and opacity rows display percentages. The selected-key detail field shows the stored number (for example, opacity 0.5 means 50%). The previous/next arrows jump to keys for that property. Turning off a stopwatch asks before removing its keys and keeps the evaluated playhead value. Use project Undo/Redo to reverse edits.

Drag a property row's number left or right to decrease or increase it. The canvas previews the change while you drag; releasing the mouse commits one Undo step. Hold **Shift** for 10× speed or **Alt** for 0.1× precision. **Escape** cancels the drag and restores the previous value. Click without dragging to type a number, then press Enter or leave the field to commit it. Locked layers cannot be adjusted. Scrubbing an animated property updates or adds a key at the current playhead; unanimated properties keep their fixed-value behavior.

## Selecting and editing keys

- Click a key to select it; Shift-click or Ctrl-click adds/removes keys across property tracks and layers.
- Drag selected keys together. Alt-drag duplicates them. One drag makes one undoable edit. Keys stay inside the scene, retaining their spacing; a key moved onto another key replaces that destination key.
- Use **Copy**, move the playhead, then **Paste**. Keys copied from one layer paste onto the selected layer, retaining their properties and relative timing. Keys from multiple layers paste back onto their source layers. Missing/locked destinations and keys beyond the scene duration produce a message without partial changes.
- With the timeline focused, Ctrl+C/Ctrl+V copy/paste and Delete removes selected keys. Ctrl+A selects keys in the matching layers. Left/Right moves one frame. Text fields keep normal typing behavior; Enter commits a value and Escape cancels it.
- Select **Linear**, **Easy ease**, **Hold**, or **Bezier** in the timeline toolbar. **Curve editor** opens adjustable Bezier handles and numeric controls. A single selected key also exposes exact time and value fields.

**Animated only** (or U while the timeline is focused) hides properties without keys. Turn it off to enable new tracks. Search filters layers by name; **Expand all** and **Collapse** affect matching layers. Zoom increases horizontal timeline space up to 8×; scroll sideways while layer labels stay fixed. Drag the top edge to resize the timeline. **Snap** uses the scene's frame rate, or 60 fps for scenes without one; it does not change the output format or retime existing keys.

The existing inspector key editor remains available. Both editors modify the same saved tracks. Timeline edits update the design preview; publishing still requires the usual Stage/TAKE controls. No cloud service or Adobe installation is required.
