# Motion editing and keyboard shortcuts (0.19)

## Layer and graphic timing

Open **Animate**, then select a layer. Drag its blue timing bar to move the layer and its animation together. Drag the left or right handle to trim its visible range while retaining its keyframes. **Shift-drag the right handle** stretches the animation; **Alt-drag the bar** slips animation within the current visible range. Frame snapping follows the scene frame rate, including 60 fps; hold Ctrl while dragging a clip to bypass snapping.

The compact **Layer timing** row also provides exact **In** and **Out** times and buttons to set either edge at the playhead. **Graphic range & markers** controls total duration, a looping preview work area, and named markers. Shortening a graphic retains keys and layer timing beyond the new end; cues are trimmed to fit. Increase the duration to reach retained keys again. Work area looping affects editor preview, not output playout.

Expand a layer to edit transform keys. Select multiple transform keys to reverse or stretch their timing. Use **Saved animation presets** in the inspector to save a layer's keyed properties and apply them at the current playhead. Appearance tracks that refer to masks or effects require the corresponding mask/effect IDs on the destination layer.

Dragging previews locally until release, and a completed drag is one Undo step. Escape, lost capture, focus loss or a changed scene cancels a gesture. Locked layers cannot be moved or trimmed.

## More properties, masks and formulas

Within an expanded timeline layer, use **Appearance / masks → + Property**. Supported tracks include fill/stroke/gradient colors, gradient stops, corner radius, font size and spacing, effects, image crop, and mask geometry, points, feather and density. Keys support linear, easy ease, hold and Bezier interpolation. These tracks share the renderer used by output and PNG export.

**Advanced masks & track matte** in the layer inspector adds rectangle, ellipse and polygon masks. Masks combine in list order using Add, Subtract or Intersect. Edit polygon points in the mask preview. Adding/removing polygon points removes their point animation to avoid applying keys to the wrong point. Layer mattes use another layer in the same group, with alpha or brightness (luma), inversion and optional source hiding. Circular matte references are rejected.

**Property links & formulas** drives numeric properties after keyframe evaluation. Use the variable and layer dropdowns to build references, then Apply. Examples:

```text
200 + var("homeScore") * 10
layer("title", "x") + 40
clamp(value + sin(time * pi) * 20, 0, 1920)
if(var("homeScore") > var("awayScore"), 1, 0.5)
```

This is a bounded arithmetic language, not JavaScript. It supports numeric and Boolean project variables, linked numeric layer properties, arithmetic/comparisons, and the functions shown in the inspector. Missing references and cycles are rejected. Arithmetic errors retain the original animated value and show a message. A layout constraint can still determine the final position/size of a linked layer.

## Visual button logic

In **Panels**, select a control and choose **Open visual logic editor** in its actions. Existing action lists convert into connected blocks. Add actions or IF/ELSE decisions, drag blocks, and connect an output port to another block's input. The inspector also supplies destination dropdowns. Exactly one block is Start. Connect or remove disconnected blocks; cycles are rejected.

**Trace without running** simulates variable changes locally and displays the chosen path. It never contacts a feed or sends output; operations needing a real result stop the trace. **Apply logic** saves the graph without executing it. Actual button execution continues through the local command service, including permissions for both decision paths, cancellation, history and command deduplication. A decision is evaluated once when reached.

## Keyboard reference

Click **Shortcuts** in the design toolbar, or press F1 / ?, to open the reference. The following operate in Design and Animate unless focus is in a text field, timeline, graph or modal dialog:

| Shortcut | Action |
| --- | --- |
| Ctrl+S | Save project (also inside a text field) |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / Cut / Paste selected layers |
| Ctrl+J / Ctrl+D | Duplicate selected layers |
| Ctrl+A / Ctrl+Shift+A | Select all unlocked layers / Deselect |
| Ctrl+G / Ctrl+Shift+G | Group / Ungroup a plain group |
| Delete / Backspace | Delete unlocked selected layers |
| F2 on a layer row | Rename layer; Enter to finish, Escape to cancel |
| Arrows / Shift+Arrows | Nudge 1 / 10 pixels |
| V / H / Space held | Select / Hand / Temporary pan |
| T / U / Shift+U | Text / Rectangle / Cycle shapes |
| O / L / P / A | Ellipse / Lasso layer selection / Pen / Path points |
| M / Shift+M | Rectangle / Ellipse layer selection |
| B / E / Shift+E | Vector brush / Mask eraser / Mask restore |
| C / G / K / I | Crop mask / Gradient / Fill layer / Eyedropper |
| X / D | Swap colors / Reset to black and white |
| Z / Alt-click | Zoom tool / Zoom out |
| [ / ] | Decrease / Increase active brush size |
| Ctrl+0 / Ctrl+1 | Fit canvas / 100% |
| Ctrl++ / Ctrl+− | Zoom canvas |
| Escape | Cancel the current gesture |

Text fields retain normal text selection, clipboard and Undo. Click a layer row or artwork on the canvas to target layer shortcuts, or finish renaming with Enter / Escape. Copy and paste show a confirmation; pasted layers are selected and appear at the original position. Timeline Ctrl+C/V operates on selected transform keys. Layer clipboard is local to the open application and works across scenes in the same project, preserving ancestor groups and imported asset references. Copy linked layers together when pasting across scenes. Ungroup refuses groups with transforms, repetition or opacity changes rather than discarding their appearance. Existing Panel authoring keys (Ctrl+D, Ctrl+G, arrows and Delete) remain available in the panel canvas.

All project and control changes remain local. Editing, saving, applying formulas, and tracing logic never TAKE a graphic.
