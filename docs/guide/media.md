# Images & shapes

Floating media (images and shapes) is anchored to cells and rendered on the floating media layer, alongside charts. All of it survives persistence.

## Images

```ts
const image = sheet.addImage({
  src: '/assets/logo.png',
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
