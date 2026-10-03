# Design workspace

The shared [Properties inspector](PROPERTIES-INSPECTOR.md) organizes layer editing into Transform, Style, Motion, Masks and Data tabs, with section search, numeric scrubbing and separate scene settings.

## Canvas navigation

- Turn the mouse wheel over the canvas to zoom around the pointer (2%–1600%).
- Hold **Space** and drag, use the middle mouse button, or select the **Hand** tool to pan.
- **Fit** / **0** fits the actual scene dimensions. **100%** / **1** resets to actual pixels.
- Zoom and panning affect only the editor, never broadcast output or exported graphics.

## Panels

Drag the header of **Scenes**, **Layers** or **Properties** into the canvas area to float it. Drop within 90 pixels of a workspace edge to dock it. The header dropdown also offers Left, Right and Float.

Drag the floating panel's bottom-right corner to resize it. Drag a dock edge to adjust its width, or the divider between docked panels to adjust their heights. Panels scroll independently.

Use the top workspace buttons to show hidden panels, or **Reset layout** to restore the defaults. Positions are saved locally per account, server and project. They are not part of the broadcast graphics.

## Drawing and layers

The grouped [design toolbox](DESIGN-TOOLBOX.md) provides selection tools, drawing brushes, shapes, masks, gradients, fill and color sampling. Click **»** to show tool names. Choose a foreground color, then drag on the canvas. Hold Shift for squares/circles. Click polygon points and press Enter or Finish polygon to close it; Escape cancels. Use **P** for curved Pen paths and **A** to edit their points and handles.

The top toolbar still provides images, arrows, video, tickers and countdowns. Uploaded images can also be dropped onto the canvas.

Search or filter the Layers panel. Shift/Ctrl-click selects multiple layers. Use the toolbar to duplicate, group or delete selected unlocked layers. Single and double clicks select a layer; press **F2** on its row or click its pencil to rename it. **Enter** finishes the rename and **Escape** cancels it, returning focus to layer shortcuts. Drag a row onto another row to place it above that layer within the same parent group. Eye and lock buttons control visibility and editing. Linked layout/clipping layers must be grouped together.

## Editable masks

Select a layer and click its mask icon, or **Add layer mask** in Properties. Masks apply to text, shapes, images and other layer types without altering their source files.

- Choose Full layer, Rectangle or Ellipse, or draw a rectangular/elliptical mask directly on the selected layer.
- Use **Eraser mask** (**E**) and **Restore mask** (**Shift+E**) to paint the mask. The brush size is a percentage of the layer's shorter dimension. Start a stroke inside the selected visible, unlocked layer. **B** now draws a separate vector brush layer.
- **Invert**, **Density** and **Feather** adjust the mask. Shape bounds are editable percentages.
- Undo mask stroke removes the most recent stroke. Clear mask strokes retains the shape. Remove layer mask reveals the original artwork.
- Completed strokes, drawn layers and mask changes participate in project Undo/Redo. A mask supports 100 strokes of up to 300 points each; the normal project size limit still applies.

Masks use layer coordinates and follow its size, rotation and group transforms. They are included in saved projects, PNG export and the shared broadcast renderer. Feathering is measured in layer pixels. This adds native editable masks; it does not change the PSD importer's existing Photoshop-mask conversion limitations or provide Photoshop raster filters.

The expandable animation timeline remains available under **Animate**. Canvas tool shortcuts do not override keys while typing, using dialogs or editing timeline tracks.
