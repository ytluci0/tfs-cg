# Custom buttons and individual panel parts — BroadcastCG 0.16

Open **Panels → Build**. The left sidebar starts with **Build from individual parts**. Add a blank action button, artwork, text, image, pitch marking, player button or match control. Each part has its own position and size. The existing widgets and saved tool library remain available below.

## Canvas navigation

Free-layout panels use the full available workspace width. **Fit width** enlarges small canvases as well as shrinking large ones; **100%** shows original canvas pixels and centers the canvas when there is room. Zoom changes the view only: saved control sizes, positions, bindings and actions stay unchanged.

- **Canvas only** hides both sidebars in Build. **Show panels** brings them back.
- **Ctrl+mouse wheel** zooms around the pointer. The zoom menu and + / − buttons are also available in Operate.
- **Middle-drag** pans. In Build, you can also hold **Space** while dragging or select the **Hand** tool. Release Space or turn Hand off to move controls again.
- **Escape** cancels an active pan or control drag. A completed move/resize remains one project Undo step, at any zoom.

Vertical scrolling keeps long panels accessible. Touch operation retains 100% control sizing. Canvas width and height in Panel settings define the saved area. In **Fill area**, dragging into extra workspace expands that saved area; changing the view alone does not rearrange your layout.

## Design a button

1. Add **Blank action button**, select it, and click **Design button visually** in the inspector.
2. Add rectangles, ellipses, text/icons, images, lines and polygons as separate visual layers. Drag a layer to move it; drag its corner to resize it. The inspector provides exact coordinates, dimensions, rotation, opacity, fill, gradient, border and corner radius.
3. Reorder, duplicate, hide or lock visual layers. Polygon points are editable under **Custom shape points**. Text supports multiple lines, font settings, alignment and variable insertion. Images support local upload or a variable containing an image URL.
4. Preview **normal**, **hover**, **pressed**, **live** and **disabled** appearances. Normal properties are inherited; editing another state creates an override for that layer. **Reset this state override** restores inheritance.
5. **Apply button design** saves the artwork as one project edit. **Cancel design** discards it. The modal has its own Undo/Redo, independent of project Undo/Redo until applied.
6. Configure the button's actions in the inspector. Click, press, release and hold sequences remain independent of the artwork. Live appearance uses the existing live-condition rules. Build mode and the visual editor do not execute actions; **Test actions** and **Operate** do.

Artwork supports gradients, photos, symbols, arbitrary polygon shapes and several text fields on one button. Use `{{homeScore}}`, other project variables, or the variable dropdowns to fill text, colors and images. API data can first populate these shared variables using the existing Data bindings.

The button's outer bounds define its clickable area. Choose **Keep proportions** to avoid distorting artwork when its outer size changes. A design supports 50 visual layers, and a panel supports 500 independent controls. Controls can be as small as 24 × 24 canvas pixels; use larger controls for touch operation.

### Editor shortcuts

- Arrows: nudge the selected visual layer; Shift: 10 units.
- Ctrl+D: duplicate the visual layer. Delete: remove it.
- Ctrl+Z / Ctrl+Shift+Z: undo / redo the design edit.
- During a drag, Alt ignores snap; Shift preserves proportions when resizing.

## Assemble a football panel

Expand **Pitch & players** or **Match controls** to add one part at a time. Choose Home/Away before adding team-specific parts. Score + and − buttons use bounded counter actions, so the default score cannot become negative. Score displays are separate editable artwork. Clock display, Start, Pause and Reset are also separate parts using the existing saved clock service.

**New football panel from parts** creates a separate example panel. Its background, pitch lines, centre circle, penalty boxes, players, substitutes, scores, score buttons, team fields, formation dropdowns, color pickers and clock controls can all be moved, resized, redesigned or deleted independently. It retains existing scores, team names, formations and roster data. It does not replace your existing panels.

Player buttons have a **Player data** section:

- **Formation slot** follows the player currently occupying that slot, including after a substitution.
- **Bench position** follows a position in the team's bench list.
- **Specific roster player** binds to one person.
- **Follow formation inside** links the button to an artwork control used as the pitch background. Formation dropdown changes reposition linked players. A saved custom formation works here too.
- Drag a player by itself to place it freely; this detaches its formation link. Choose the pitch again to restore formation following. Moving the pitch and player together preserves the link.

Inside a player button, `{{player.number}}`, `{{player.name}}`, `{{player.position}}`, `{{player.photo}}`, `{{player.color}}`, `{{player.team}}` and `{{player.card}}` are local visual bindings for that player. They are not new global variables. In Operate, clicking a field player fills the shared `playerName`, `playerNumber`, `playerPhoto` and `playerPosition` fields. Select a substitute and then a field player to stage a substitution; **TAKE** applies the existing staged workflow.

The former **Edit football layout** option still creates movable composite widgets. Use the new parts palette when you want to edit each item inside that layout.

## Reuse and persistence

Panel navigation opens in **Fill area**: the canvas covers the available workspace at 100% button size. Dragging a control into the extra area expands the saved canvas in the same Undo step. Resizing the application by itself does not change saved control positions. **Fit width** scales the saved layout to the available width; **Canvas only** hides the Build sidebars.

In Operate, buttons and counters stay responsive while local commands finish. Explicit presses are processed in order; failures or **Cancel sequence** clear pending presses instead of retrying them. Quick local actions return their confirmed result directly, and only longer operations show a Running indicator. Permissions, conditions and output acknowledgement still apply.

Save a finished control to **Tool library → Saved**, or group several controls and save them through **Components**. Duplicating a pitch and its linked players remaps their internal links to the copied pitch. Copying a player alone makes it freely positioned. Prefixed component variables preserve scoped player bindings, artwork arrays and visual states. Linked component style publishing includes button artwork.

Artwork is saved locally with the project, including state overrides. Uploaded image references are included in the existing project/package export and asset-permission checks. Panel editing permissions protect the artwork; operator permissions still control live use. Build and Operate use the same stacking order, so selecting a background does not cover controls above it.
