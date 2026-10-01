# Testing the exporter inside Adobe After Effects

This qualification is separate from the simulated exporter contract and the BroadcastCG native-runtime suite. Preparing the files does not mean the Adobe-hosted test has run or passed.

## Prerequisites

- Adobe After Effects installed and activated through the user's Adobe account. An existing entitlement avoids starting a new subscription. Adobe security/privacy choices, authentication and any payment must be handled by the user.
- The user must enable AE script file writing if AE requests it. The test does not change that preference or other security settings.
- An empty AE project. The fixture refuses to replace an existing project.
- An output-module template containing `PNG` in its name for automatic reference rendering. If no template exists, exports and the AEP are preserved with a `needs-PNG-output-template` status. No fake reference render is substituted.

## Run

1. From the repository, run `node desktop/prepare-ae-host-tests.mjs`. It creates a uniquely named directory under `desktop/.cache`, a generated `Run-AE-qualification.jsx`, a logo PNG, and an exporter hash. Nothing is installed into Adobe's script folders.
2. In an empty AE project, run the generated JSX through **File → Scripts → Run Script File**. The script builds three test compositions, evaluates the unmodified production exporter with a scoped file-dialog shim, saves the AEP, exports `.bcae` files, and queues available PNG reference renders. It leaves all results and any failure in that directory.
3. Run `node --experimental-strip-types desktop/verify-ae-host-tests.mjs "<output directory>"`. This verifies actual AE-evaluated values against the converted scene, including position, signed scale, rotation, opacity, and omissions. A missing host report or failed export is a failure, not a skipped success.
4. Open each package in the installed BroadcastCG app. Attach the corresponding Adobe PNG references at their work-area-relative times. Compare transparency, stacking, pivot/rotation, text baselines and color. Record visual differences separately; the numeric checker does not certify visual fidelity.
5. Edit text and keys, bind a variable, save, restart and use a panel button to stage/TAKE/hide. Include assets and references in a complete project export, reimport it, and compare again.

| Composition | Checks |
| --- | --- |
| AE-QA-Transforms | Linear motion, off-center anchor, negative/nonuniform scale, rotation, hold opacity, expression-result samples, separated X/Y position |
| AE-QA-Text-PNG | Editable point text and baseline, local font resolution, embedded still PNG, layer in/out times |
| AE-QA-Diagnostics | Supported solid survives; parented and 3D layers are explicitly reported as skipped |

The fixture samples frames 0, 6, 15, 30, 45 and 59 of a 2-second, 30-fps work area starting at composition time 0.5 seconds. Broader coverage must include actual user compositions, fractional frame rates, longer timelines, many layers and measured frame timing before production qualification. A generated passing fixture does not prove arbitrary AEP, effect, expression or plugin parity.

Official workflow references: [Adobe scripts](https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html), [Adobe rendering and output templates](https://helpx.adobe.com/after-effects/desktop/render-and-export/basics-of-rendering-and-exporting/basics-rendering-exporting.html).
