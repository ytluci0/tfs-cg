# Local video layers

Click **Video** in the Design or Animate toolbar and choose an MP4 or WebM (up to 50 MB). The editor checks that it can decode a frame before uploading to the local asset library and adding the layer. Canceling or choosing an unreadable file leaves the scene unchanged. A successful import preserves the video aspect ratio, centers it, selects it, opens Style → Media content and clears any PSD/AE reference overlay.

You can also drop a video file onto the canvas, insert one from the Media library, or fill an older empty video layer using **Choose video…** in its Media content section. **Replace video…** keeps the layer’s position, animation and identity.

Media content provides a source preview, **Preview on canvas**, fit/fill/stretch, loop, start offset and speed. Playback is muted by default. These previews do not stage or TAKE output. The timeline Play/Pause controls also drive the video. Source previews play independently of the canvas timeline.

For imported files that fail decoding, convert to H.264 MP4 or VP8/VP9 WebM. Container extension alone does not guarantee a compatible codec. WebM transparency depends on the encoded video. This feature does not add audio output or MOV/ProRes decoding. Local asset URLs can be supplied by a data variable; external video URLs are not loaded by the graphic renderer.

Native acceptance: build, then `node desktop/run.mjs --smoke-test --video-only`. The isolated test generates actual H.264 MP4 and VP8 WebM clips, uses the toolbar import path, checks cancellation/invalid files, Undo, playback/pause, drop/replace, save/reopen, variable sources and desktop-output acknowledgement. It captures 1280×720 and 1920×1080 layouts. This verifies the desktop renderer; it does not qualify an external hardware receiver.
