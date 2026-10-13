# Angular

`@ezygrid/angular` ships a standalone `<ezy-grid>` component (peer dependency: `@angular/core` **>= 17**, built with ng-packagr).

## Install

::: warning Local workspace adapter
The `@ezygrid/*` adapters are built from this repository and are not published on public npm. The `@bookklik/ezygrid` package ships the framework-neutral editor. These instructions link a built local checkout; adjust the relative paths for your application.
:::


```bash
# Build the cloned Ezygrid checkout first: pnpm install && pnpm build
# From a consuming app beside the ezygrid checkout:
pnpm add @ezygrid/angular@link:../ezygrid/packages/angular/dist @ezygrid/core@link:../ezygrid/packages/core @ezygrid/theme-default@link:../ezygrid/packages/theme-default
```

## Usage

```ts
import { Component } from '@angular/core';
import { EzyGridComponent } from '@ezygrid/angular';
import '@ezygrid/theme-default/index.css';

@Component({
  standalone: true,
  imports: [EzyGridComponent],
  template: `<ezy-grid [config]="config" [options]="options" style="height:480px" />`,
})
export class HostComponent {
  config = { worksheets: [{ name: 'Sheet1', data: [[1, '=A1+1']] }] };
  options = { formulaBar: true, toolbar: true };
}
```

## Inputs

| Input | Type | Description |
| --- | --- | --- |
| `config` | `CreateGridOptions` | Workbook options; changing it rebuilds the workbook |
| `options` | `GridRendererOptions` | Presentation options; changing them swaps the renderer |

## Accessing the model

```ts
import { ViewChild, Component } from '@angular/core';
import { EzyGridComponent } from '@ezygrid/angular';

export class HostComponent {
  @ViewChild(EzyGridComponent) grid?: EzyGridComponent;

  ngAfterViewInit() {
    this.grid?.workbook?.activeWorksheet.setValue(0, 0, 'Hello');
  }
}
```

The component uses the `OnPush` strategy and is uncontrolled: the workbook owns state.
