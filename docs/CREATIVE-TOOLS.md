# Advanced design and control builder — 0.12.0

All editing, projects, accounts and output run locally. This release extends the same designer and panel builder used by existing projects. Existing PSD/AE imports, saved panels and output formats remain supported.

## Graphic design

Open **Design**, choose a scene and select a layer. Scroll the inspector to **Appearance & effects**.

- Choose solid, linear or radial gradient fills, or no fill. Set the second color and gradient angle. Colors accept `{{variable}}` expressions.
- Add an outline; edit shadow color, X/Y offset and softness; add glow or blur.
- For an image, choose Cover, Contain or Stretch. Use Crop zoom and horizontal/vertical crop position. Apply a rounded rectangle or ellipse mask.
- For text, turn on **Auto-fit text inside its box**. It reduces the font size to fit the width and multiline height. Letter spacing and line height remain editable.
- The toolbar adds **Line**, **Arrow** and **Vector** layers. Vector points scale with the layer: drag points in the inspector, double-click to add, select a point to delete, and choose an open or closed shape.
- Shift-click layers in the canvas or layer list to select several. Align edges/centers, distribute three or more layers, drag selected layers together, or enable a snap grid. Locked layers stay fixed. Alignment uses the layer's unrotated box; animation positions move with it.

PNG export and live output use the same renderer. Heavy blur/glow on many large layers can cost more GPU time; use output health to check your actual composition.

## Animation

Open **Animate**, select a layer and property. Existing numeric key editing remains available.

- Shift-click diamonds in the inspector's key track to select multiple keys. Drag to move them together; Alt-drag copies them.
- Copy selected keys, move the playhead and **Paste at playhead**. The earliest copied key lands at the playhead. Keys at a destination time are replaced. Moving a selection beyond an edge clamps the whole selection together.
- Choose **Bezier** interpolation. Drag its two curve handles or edit X1/Y1/X2/Y2. Y handles support overshoot. The curve belongs to the outgoing segment of the selected key.
- Apply Fade in, Slide in, Pop in or Fade out presets. A preset replaces the affected property tracks on the selected layer.
- Expand **Animation cues** in the scene inspector. Create Intro/Hold/Outro or add your own named sections. Each has start/end times, optional looping, and Hold final frame or Hide when finished. Preview a cue locally, then **Stop cue preview** to resume ordinary editing.
- Add **Play animation cue** to a button or macro, then choose its graphic and cue. It sends the current graphic and data to Program immediately. It requires TAKE permission and ready output. Looping continues until another cue/TAKE or Hide; an ordinary TAKE plays the full scene. Update live preserves the active cue and its clock.

## Button design and interactions

Open **Panels → Build**, add/select an action button and expand **Control appearance & states**.

Set background, text and border colors; border width and radius; font size/family/weight; an icon/symbol; and an image URL or uploaded PNG/JPEG/WebP. A label override such as `HOME: {{homeScore}}` updates with data. Normal styling is inherited by Pressed, Disabled and Live states unless you override a property.

**Live state, visibility & availability** provides typed conditions. Configure Live styling, whether the control appears in Operate, and whether it is enabled. Controls remain discoverable in Build. Missing or incompatible condition variables fail closed. Keyboard shortcuts and the command service also enforce availability.

The main sequence runs on **Click**. Under **Press / release / hold actions**, give each event its own sequence. Hold begins after its delay and repeats after each sequence completes plus the configured gap, so slow commands cannot accumulate a repeat backlog. Pointer/key release stops repetition; a completed hold suppresses Click. Release runs once on a normal pointer/key up. Pointer cancellation or losing window focus cancels repetition; completed actions remain applied. Enter/Space support button gestures; single-letter panel shortcuts run Click only.

The tool library includes ready-configured **Hold + home score** and **Hold + away score**, in addition to regular bounded +/− counters.

For branching, create two macros and add **IF / ELSE macros** to a sequence. Select a true macro, an optional false macro and a typed condition. The condition is evaluated once at the branch entrance; changes made by its true branch cannot also trigger the false branch. Permission checks cover both possible branches before any action runs.

## Data widgets

- **Roster** provides a searchable player list with photos. Choose all/home/away, connect a text variable for the selected player ID, then map name, number, photo, position and team to existing variables. Selection applies these fields together before running the main sequence.
- **Dropdown** and **Choice buttons** can use API data under **Choice data**. Choose a saved source, an array path and value/label/photo fields. Optionally map extra fields from each row. Fetch the source in Data or with a Fetch API action. Choices must have unique IDs; lists are limited to 500 rows. A failed or malformed refresh leaves the previous data intact.
- **Progress** displays a numeric value between a configured minimum and maximum, useful for possession or objective progress. Bind an existing slider or API variable to control it.
- **Status** displays a variable with configurable appearance and a conditional Live state.
- Existing **Formations** lets you position players, name and save custom formations; Formation controls show them immediately.

Example: a Roster selector fills `playerName`, `playerNumber` and `playerPhoto`. A Goal button increments `homeScore`, then plays a player graphic's Intro cue. A separate Hold/Outro button controls its subsequent animation. Live styling can follow a Boolean or match-status variable set by these sequences.

## Linked components

Select controls and use **Components → Save selected**. **Add** creates an independent snapshot; **Add linked** keeps a shared appearance relationship.

Edit one linked copy, select its changed controls, then open Components and choose **Publish selected styles** for that component. This updates colors, borders, fonts, icons/images and state styling in every linked copy and its library definition. Variable prefixes are preserved in style expressions. Positions, geometry, actions, labels and data connections remain independently editable; label overrides within appearance are shared. Use **Detach this instance** to stop receiving style changes. Deleting a library definition detaches its existing copies without removing them.

## Validation

The release is checked by automated schema, action-service and compatibility tests, plus native desktop workflows for styling, text fitting, keyframe editing, roster mapping, state conditions, held buttons and persistence. Output qualification records the tested resolution, rate and scene. Supporting 60 fps is not a guarantee that every possible composition or receiver will sustain that rate.
