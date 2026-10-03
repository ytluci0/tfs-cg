# Design toolbox

The Design and Animate canvas has a grouped, two-column toolbox. Click **»** above the icons to show tool names; click **«** to return to the compact view. The bar above the canvas shows settings for the active tool. Hover any icon for its name, shortcut and usage hint.

| Tools | Use |
| --- | --- |
| Select (V) | Move layers and use transform handles. |
| Rectangle (M), ellipse (Shift+M), lasso (L) selection | Select editable layer bounds. Shift adds and Alt subtracts; choose Fully enclosed to require enclosure. Locked and hidden layers are excluded. These are layer selections, not raster pixel selections. |
| Text (T), Pen (P), path points (A), motion route | Create text and vector paths; edit curve handles or an existing motion route. |
| Shapes (U / Shift+U) | Rectangle, rounded rectangle, ellipse, triangle, star, regular polygon, line, arrow and polygon path. Star points/inner radius and polygon sides are configurable. Shift constrains proportions. |
| Brush (B) | Draw an editable vector stroke with size, opacity and smoothing controls. Each stroke becomes its own layer. [ and ] adjust size. |
| Eraser (E), Restore (Shift+E) | Hide/reveal the selected layer using its mask. The source image or shape is unchanged. Mask size is a percentage of the layer's shorter dimension. |
| Crop layer mask (C), ellipse mask | Draw a nondestructive mask on the selected layer. Adjust or remove it in Properties → Masks. This crops the layer, not the composition dimensions. |
| Gradient (G) | Select a shape or text layer, then drag to choose the gradient direction. Foreground/background swatches provide the two colors. Linear fills follow the direction; radial fills remain centered. |
| Fill layer (K) | Click a shape or text layer to apply the foreground color. This is an object fill, not a pixel flood fill. |
| Eyedropper (I) | Sample rendered shapes, text and still images into the foreground color. Transparent pixels cannot provide a color; hide videos before sampling. External images must allow local reading. |
| Hand (H), Zoom (Z) | Pan, or click to zoom in (Alt-click out). Wheel zoom and Space-drag continue to work. |

The bottom swatches set foreground and background/gradient-end colors. **X** swaps them; **D** resets to black and white. **F1** opens the full shortcut reference.

Masks and gradients preview while dragging. Pointer cancellation, lost capture and Escape discard the draft. A completed drawing or mask gesture is one project Undo step. New tools use the existing layer/mask schemas, save in projects and render through the shared output/PNG pipeline. No graphic is taken live by editing.

This toolbox supports native layer, vector and mask workflows. It does not add Photoshop pixel selections, clone/healing brushes, content-aware fill or PSD smart-object/plugin execution.

Native qualification: build, then `node desktop/run.mjs --smoke-test --toolbox-only`. Uses an isolated profile and checks real mouse/keyboard gestures, cancellation, Undo, save/reopen, SVG pixels, output acknowledgement, and 1280×720 / 1920×1080 layouts. Output acknowledgement does not qualify a physical broadcast receiver.
