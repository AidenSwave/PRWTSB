# Script Editor: Visual Authoring Upgrade

## Summary

Turn the current basic Twine map into a smoother visual story and screenplay editor. Preserve compatibility by parsing and regenerating the existing screenplay syntax, while keeping a raw Source tab for unsupported commands and recovery.

## Map Editor

- Store live node positions while dragging, then save final positions on drag end so movement is smooth.
- Remove the permanent passage sidebar editor and open passages in a large modal/editor workspace by double-clicking; provide Save, Close, and Delete controls.
- Remove the minimap.
- Add named visual groups: resizable background boxes that can contain passages without affecting story execution.
- Add a “Set as Start” action and write the selected passage PID to Twine’s `startnode`.
- Persist groups, reroute points, socket colours, edge styles, and collapsed UI state in an editor-only JSON script embedded outside `<tw-storydata>`.

## Connections and Sockets

- Give passage nodes automatic top, right, bottom, and left handles.
- Choose the most natural handle pair from relative node positions: side-to-side for parallel nodes and top-to-bottom for vertical layouts.
- Keep curved connectors at passage sockets, but support freely positioned two-dimensional reroute points with straight segments between them.
- Allow users to add, drag, and remove reroute points from an edge.
- Convert `/Socket` into a coloured output socket on the passage node; connecting it generates `Continue: [[Target Passage]]`.
- Cycle socket colours through a tasteful preset palette and retain colours in editor metadata.
- Keep ordinary existing `[[links]]` visible and editable.

## Visual Passage Editor

- Build a Beat-inspired screenplay canvas with a Visual tab and Source tab.
- Parse passage text into a lossless ordered document model; regenerate the original syntax on save and retain unknown syntax as editable raw blocks.
- Render character headings distinctly, with dialogue tags such as `[U0]` as small pills and shots such as `[Solo]` as compact controls.
- Pressing Enter after a character heading creates an indented dialogue block automatically.
- Render choices as rounded Apple-style option cards without displaying `*`; clicking expands variables and conditions, while double-clicking opens the choice body as a focused nested “micro-passage.”
- Support inline expansion for quick edits without leaving the main passage.
- Treat standalone prose as description/action text. Associate preceding command blocks with that description through a small expandable indicator above it.
- Render commands visually:
  - Delay: clock chip with slider, numeric value, units, and delete control.
  - Audio: audio icon, asset name, delay, looping/continuation, fade, low-pass, and supported modifiers.
  - Sequence: sequence icon and asset name.
  - Scene, NoFade, variables, conditions, and other recognised parser steps: dedicated compact blocks.
- Typing `/Delay`, `@audio`, `@sequence`, or `/Socket` creates the corresponding visual block instead of leaving command text in the screenplay.
- Conditions use variable, operator, and value controls; variable changes use variable, operation, and amount controls.

## Runtime and Preview Fixes

- Replace file-based preview with a temporary localhost preview server so remote/runtime loading behaves like normal web hosting.
- Delay runtime startup until all screenplay modules, including the static module, are registered; prevent `setup.projectWho.static.renderMarkup` from being accessed before it exists.
- Show preview startup failures inside the editor with a useful error instead of silently opening a broken browser page.
- Keep preview-only changes out of saved story content.

## Testing

- Verify smooth drag updates, saved positions, dynamic handles, freeform reroutes, groups, and start-passage persistence.
- Round-trip the supplied HTML and confirm passages, screenplay syntax, embedded runtime, CSS, and unknown commands remain intact.
- Test character/dialogue formatting, descriptions with hidden commands, audio/sequence/delay controls, nested choices, variables, and conditions.
- Confirm sockets generate valid `Continue: [[...]]` lines and reconnect correctly after reopening.
- Preview the real story and confirm the static-module startup error is gone.
- Test existing stories without editor metadata and ensure metadata never changes SugarCube execution.

## Assumptions

- Editor-only map data is embedded in the HTML but outside Twine’s story data.
- Existing screenplay syntax remains the runtime source of truth.
- The visual editor is the default; raw source remains available as an escape hatch.
- This phase enhances the current Electron application rather than replacing SugarCube.
