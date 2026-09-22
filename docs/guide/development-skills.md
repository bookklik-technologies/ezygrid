# Development skills

Ezygrid provides seven repository skills for developers using AI coding agents. Each skill covers a focused spreadsheet workflow using the current public APIs and source.

An **Ezygrid plugin** is JavaScript that extends a workbook or renderer at runtime. An **agent skill** is a `SKILL.md` instruction file that helps a coding agent author Ezygrid code or workbook data. Skills do not add runtime capabilities to the library.

## Repository setup

Clone the Ezygrid repository and open the checkout in your coding agent. The skills are versioned under `.agents/skills/`; they are not included in published packages and require no personal installation.

Codex discovers repository skills from `.agents/skills` between the working directory and repository root. It can select a skill from its description or you can invoke one explicitly. If a newly added skill does not appear, restart Codex. See [OpenAI's skill documentation](https://learn.chatgpt.com/docs/build-skills) for discovery and client-specific invocation details.

In Codex CLI or the IDE extension, use `/skills` or type `$` to select a skill. Other agents may have different discovery rules. Keep the repository layout intact because each skill links to local documentation and source files.

## Skill catalog

| Skill | Use it for | Guide |
| --- | --- | --- |
| [`ezygrid-workbook-creation`](https://github.com/bookklik-technologies/ezygrid/blob/main/.agents/skills/ezygrid-workbook-creation/SKILL.md) | Workbooks, sheets, cells, structure, batching and serialization | [Workbook and worksheets](/guide/workbook) |
| [`ezygrid-formula-development`](https://github.com/bookklik-technologies/ezygrid/blob/main/.agents/skills/ezygrid-formula-development/SKILL.md) | Formulas, custom functions, dynamic arrays and calculation | [Formulas](/guide/formulas) |
| [`ezygrid-data-rules-styling`](https://github.com/bookklik-technologies/ezygrid/blob/main/.agents/skills/ezygrid-data-rules-styling/SKILL.md) | Styles, formats, editors, validation, tables and rules | [Styling and number formats](/guide/styling) |
| [`ezygrid-visualization-creation`](https://github.com/bookklik-technologies/ezygrid/blob/main/.agents/skills/ezygrid-visualization-creation/SKILL.md) | Charts, pivots, images and shapes | [Charts](/guide/charts) |
| [`ezygrid-import-export`](https://github.com/bookklik-technologies/ezygrid/blob/main/.agents/skills/ezygrid-import-export/SKILL.md) | CSV, XLSX, JSON persistence and printable output | [Import and export](/guide/import-export) |
| [`ezygrid-plugin-development`](https://github.com/bookklik-technologies/ezygrid/blob/main/.agents/skills/ezygrid-plugin-development/SKILL.md) | Runtime extensions, commands and attachment cleanup | [Plugins](/guide/plugins) |
| [`ezygrid-ui-customization`](https://github.com/bookklik-technologies/ezygrid/blob/main/.agents/skills/ezygrid-ui-customization/SKILL.md) | Renderer modes, controls, themes, RTL and integrations | [Theming](/guide/theming) |

## Example requests

Include the intended spreadsheet, ranges or source data, required editing behavior and target integration.

```text
Use $ezygrid-workbook-creation to build a multi-sheet budget workbook with undoable batched updates.
```

```text
Use $ezygrid-formula-development to add a custom conversion function and formulas that handle blank cells safely.
```

```text
Use $ezygrid-data-rules-styling to format a status table with dropdown editing, validation and conditional colors.
```

```text
Use $ezygrid-visualization-creation to add a source-bound chart and refreshable revenue pivot to a worksheet.
```

```text
Use $ezygrid-import-export to add safe CSV export and XLSX workbook import with clear fidelity limits.
```

```text
Use $ezygrid-plugin-development to create a rating command plugin that cleans up correctly across renderer attachments.
```

```text
Use $ezygrid-ui-customization to configure a compact RTL grid with an accessible custom theme.
```

## Choosing and combining skills

Start with workbook creation for cells, sheets and structural edits. Add the formula or data-rules skill when calculation or validation behavior is central. Use visualization creation for worksheet-bound charts, pivots and floating media, and import/export when the deliverable crosses a file-format boundary.

Use plugin development for a reusable runtime extension, then combine it with a capability skill for the workbook features it contributes. UI customization is for renderer options and global presentation; cell styles remain in data rules and styling.

```text
Use $ezygrid-plugin-development and $ezygrid-data-rules-styling to create
a status workflow plugin with a command, dropdown editor and validation.
Use $ezygrid-ui-customization for its host theme and visible controls.
```

## Development contracts

- **Coordinates:** Worksheet row and column indexes are zero-based; displayed ranges use A1 notation.
- **History:** Group coordinated writes so they create sensible undo entries. Structural operations translate formula references through the model.
- **Plugins:** Setup is attachment-scoped. Renderer fields are optional, and every owned listener or global registration needs explicit cleanup.
- **Persistence:** Native JSON preserves workbook data but not undo history or callback predicates. CSV and XLSX have different fidelity limits.
- **Safety:** Escape formulas in untrusted CSV exports. Chart colors and image sources pass through public allowlists.
- **Rendering:** Use renderer options, theme tokens and public hooks; do not store state in virtualized DOM nodes.

## Skill structure and maintenance

Each folder contains:

```text
ezygrid-<workflow>/
  SKILL.md
  agents/
    openai.yaml
```

`SKILL.md` contains YAML `name` and `description`, focused implementation guidance, source links, an example and verification scenarios. `agents/openai.yaml` supplies display metadata and a default prompt; automatic invocation remains enabled.

When a public contract changes, update its guide and affected skills together. Keep detailed API documentation in the guides and link to it from skills instead of duplicating manuals.

For a new or revised skill:

1. Check its description against a representative request and nearby requests that belong to another skill.
2. Verify examples against current implementation and exported types.
3. Run the skill-creator `quick_validate.py` against the skill folder.
4. Inspect metadata, relative links and unfinished placeholders separately.
5. Run `pnpm docs:build` and keep dead-link checking enabled.

**Ask before running any unit tests.** Skill validation and the documentation build are not the unit suite.
