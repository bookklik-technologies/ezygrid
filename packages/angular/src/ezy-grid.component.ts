import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  createGrid,
  GridRenderer,
  type Workbook,
  type CreateGridOptions,
  type GridRendererOptions,
} from '@ezygrid/core';

/**
 * Angular wrapper (§46.3): standalone component, typed inputs, zone-friendly
 * (model mutations emit operations; Angular change detection is untouched).
 * Requires @angular/core as a peer dependency (>=17, standalone components).
 */
@Component({
  selector: 'ezy-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #host class="ezygrid-angular-host"></div>',
  styles: [':host { display: block; }'],
})
export class EzyGridComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() config?: CreateGridOptions;
  @Input() options?: GridRendererOptions;

  @ViewChild('host', { static: true })
  host?: ElementRef<HTMLElement>;

  private workbookInstance?: Workbook;
  private rendererInstance?: GridRenderer;

  get workbook(): Workbook | undefined {
    return this.workbookInstance;
  }

  get renderer(): GridRenderer | undefined {
    return this.rendererInstance;
  }

  ngAfterViewInit(): void {
    this.rebuild();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only an explicit config change replaces the workbook (and its state);
    // presentation-only changes swap the renderer, preserving edits.
    if (changes['config']) this.rebuild();
    else if (changes['options']) this.replaceRenderer();
  }

  ngOnDestroy(): void {
    this.rendererInstance?.destroy();
    this.rendererInstance = undefined;
  }

  private rebuild(): void {
    const container = this.host?.nativeElement;
    if (!container || !this.config) return;
    this.rendererInstance?.destroy();
    this.workbookInstance = createGrid(container, this.config);
    this.rendererInstance = new GridRenderer(container, this.workbookInstance, this.options);
  }

  private replaceRenderer(): void {
    const container = this.host?.nativeElement;
    if (!container || !this.workbookInstance) return;
    this.rendererInstance?.destroy();
    container.replaceChildren();
    this.rendererInstance = new GridRenderer(container, this.workbookInstance, this.options);
  }
}
