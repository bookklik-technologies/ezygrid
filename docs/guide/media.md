# Images & shapes

Floating media (images and shapes) is anchored to cells and rendered on the floating media layer, alongside charts. All of it survives persistence.

## Insert images and shapes in the editor

Choose **Insert → Upload image** for a PNG, JPEG, GIF or WebP file, or **Images → From URL** for an HTTPS image. Review the dialog preview, add optional alternative text, then choose **Insert image**. Image decoding must finish before insertion; loading errors appear in the dialog. Images fit within 400 × 300 worksheet pixels while preserving proportions, subject to the editor's 20px minimum size.

Choose **Rectangle**, **Ellipse** or **Text box** directly from Insert to add a shape at the active cell and activate its tools. Choose **Shapes** for a creation dialog with text, colors, and a preview, then choose **Insert shape**. Images and shapes start at the active cell. Cancelling a creation dialog leaves the workbook unchanged.

Select an object to activate its **Image** or **Shape** ribbon tab. Edit alternative text, shape text, colors, or dimensions directly; use **Replace image** to choose another image. Drag its body to move it, or drag one of its eight handles to resize it. Images lock their aspect ratio by default; clear **Lock aspect ratio** to resize freely. **Properties** opens a dialog, with anchor cell, pixel dimensions, offsets and stack order under **Advanced**. Dialog fields preview as you edit; **Apply changes** saves them together, and **Cancel** restores the original appearance. Invalid values remain uncommitted.

Arrow keys move a focused object by one worksheet pixel, or ten with Shift. Use the size fields for keyboard resizing. Delete or Backspace removes the selected object without clearing cells. Escape cancels an active drag or deselects an object. Each completed change is undoable. **Objects on this sheet** lists existing objects with Edit and Delete actions.

These controls also apply to [charts](/guide/charts). Sizes and offsets are stored in worksheet pixels and scale with editor zoom.

## Images

```ts
const image = sheet.addImage({
  src: 'https://example.com/logo.png',
  alt: 'Company logo',
  anchor: { row: 0, column: 4 },
  offsetX: 8,
  offsetY: 8,
  width: 120,
  height: 40,
  zIndex: 1,
});
```

## Shapes

```ts
const shape = sheet.addShape({
  shape: 'textbox',       // 'rect' | 'ellipse' | 'textbox'
  text: 'Q3 targets',
  anchor: { row: 12, column: 1 },
  width: 180,
  height: 60,
  fill: '#e6fff4',
  stroke: '#00b374',
  textColor: '#0f172a',
});
```

## Managing media

```ts
sheet.media.all();      // (ImageMedia | ShapeMedia)[]
sheet.media.remove(image.id);
```

Both `ImageMedia` and `ShapeMedia` carry stable `id`s, anchors and pixel offsets; text content is escaped at the render boundary.
