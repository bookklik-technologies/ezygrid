---
layout: home
titleTemplate: false

hero:
  name: Ezygrid
  text: Spreadsheet & data-grid for the web
  tagline: Framework-agnostic JavaScript/TypeScript spreadsheet engine with an Excel-compatible formula engine, virtualized rendering, undo/redo, and first-party integrations for React, Vue, Angular and the web.
  image: /ezygrid-preview.png
  actions:
    - theme: brand
      text: Get started
      link: /guide/introduction
    - theme: alt
      text: API reference
      link: /api/editor
    - theme: alt
      text: View on GitHub
      link: https://github.com/bookklik-technologies/ezygrid

features:
  - icon: 🧮
    title: Excel-compatible formulas
    details: 99+ built-in functions, dynamic arrays with spill, cross-sheet references, structured table references, named ranges, incremental dependency-graph recalculation and cycle detection — all without eval().
  - icon: ⚡
    title: Built for scale
    details: Sparse paged cell storage, two-axis viewport virtualization with DOM recycling, Fenwick-tree size indexes and worker-friendly calculation. A million empty rows cost almost nothing.
  - icon: 🧩
    title: Framework-agnostic core
    details: Plain TypeScript core with first-party wrappers — @ezygrid/react, @ezygrid/vue, @ezygrid/angular and an <ezy-grid> custom element. Or use the standalone browser script with no bundler at all.
  - icon: 🔁
    title: Undoable by default
    details: Every operation is a serializable command with an inverse. Batches, collaborative-ready stable IDs, history that survives row/column inserts and formula translation.
  - icon: 🎨
    title: CSS-variable theming
    details: Light and dark theme packages, high-contrast tokens, or generate your own theme CSS from a single tokens object. RTL support built in.
  - icon: ♿
    title: Accessible structure
    details: ARIA grid model with rowcount, colcount, gridcell roles and activedescendant tracking baked into the renderer.
---
