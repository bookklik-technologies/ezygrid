import { createId } from '@ezygrid/model';
import type { FloatingPosition } from './charts.js';

export interface FloatingObject extends FloatingPosition {
  id: string;
  zIndex?: number;
}

export interface ImageMedia extends FloatingObject {
  kind: 'image';
  src: string;
  alt?: string;
}

export type ShapeKind = 'rect' | 'ellipse' | 'textbox';

export interface ShapeMedia extends FloatingObject {
  kind: 'shape';
  shape: ShapeKind;
  text?: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
}

export type MediaObject = ImageMedia | ShapeMedia;

/** Floating media layer (§30/§32): images and shapes above the grid. */
export class MediaStore {
  private objects: MediaObject[] = [];

  addImage(image: Omit<ImageMedia, 'id' | 'kind'>): ImageMedia {
    const full: ImageMedia = { ...image, kind: 'image', id: (image as Partial<ImageMedia>).id ?? createId('media') };
    this.objects.push(full);
    return full;
  }

  addShape(shape: Omit<ShapeMedia, 'id' | 'kind'>): ShapeMedia {
    const full: ShapeMedia = { ...shape, kind: 'shape', id: (shape as Partial<ShapeMedia>).id ?? createId('media') };
    this.objects.push(full);
    return full;
  }

  remove(id: string): void {
    this.objects = this.objects.filter((o) => o.id !== id);
  }

  all(): readonly MediaObject[] {
    return this.objects;
  }
}

