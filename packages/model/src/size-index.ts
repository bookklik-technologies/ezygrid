/**
 * Fenwick (binary indexed) tree over size deltas, supporting:
 * - prefix sum (pixel offset of index)
 * - prefix-sum search (index at pixel offset)
 * - point update (resize a row/column)
 * in O(log n) each, over an arbitrary logical dimension size.
 *
 * Every public boundary validates its inputs: negative, fractional, NaN or
 * infinite values throw RangeError instead of corrupting the tree or
 * hanging the update loop.
 */
export class SizeIndex {
  private n: number;
  private tree: Float64Array & Record<number, number>;
  private defaultSize: number;
  /** Indexes whose size differs from `defaultSize` (sparse, for snapshotting). */
  private overrides = new Map<number, number>();

  constructor(logicalSize: number, defaultSize: number) {
    validateCount(logicalSize, 'logicalSize');
    validateSize(defaultSize, 'defaultSize');
    this.n = logicalSize;
    this.defaultSize = defaultSize;
    this.tree = new Float64Array(this.n + 1) as Float64Array & Record<number, number>;
    // Build with all items at default size in O(n).
    for (let i = 1; i <= this.n; i++) this.tree[i] = defaultSize;
    for (let i = 1; i <= this.n; i++) {
      const parent = i + (i & -i);
      const value = this.tree[i];
      if (parent <= this.n && value !== undefined) {
        this.tree[parent] = (this.tree[parent] ?? 0) + value;
      }
    }
  }

  /** Total pixel size of the first `count` items. */
  prefixSum(count: number): number {
    // Fractional/negative/NaN counts clamp to a safe prefix; infinite counts
    // are clamped to the full size instead of looping forever.
    let clamped = count;
    if (!Number.isFinite(clamped)) clamped = clamped > 0 ? this.n : 0;
    clamped = Math.floor(clamped);
    if (clamped < 0) clamped = 0;
    if (clamped > this.n) clamped = this.n;
    let sum = 0;
    for (let i = clamped; i > 0; i -= i & -i) sum += this.tree[i]!;
    return sum;
  }

  totalSize(): number {
    return this.prefixSum(this.n);
  }

  /** Pixel offset of item `index` (0-based). */
  offsetOf(index: number): number {
    this.assertIndex(index, 'index');
    return this.prefixSum(index);
  }

  /** Update the size of item `index` (0-based) to `size`. */
  setSize(index: number, size: number): void {
    this.assertIndex(index, 'index');
    validateSize(size, 'size');
    const current = this.sizeOf(index);
    const delta = size - current;
    for (let i = index + 1; i <= this.n; i += i & -i) {
      this.tree[i] = (this.tree[i] ?? 0) + delta;
    }
    // Track custom sizes sparsely so snapshots scale with stored state.
    if (size === this.defaultSize) this.overrides.delete(index);
    else this.overrides.set(index, size);
  }

  /** Custom sizes only: index -> size (sparse; excludes the default size). */
  getCustomSizes(): ReadonlyMap<number, number> {
    return this.overrides;
  }

  sizeOf(index: number): number {
    this.assertIndex(index, 'index');
    // size(i) = prefixSum(i+1) - prefixSum(i); fine for occasional queries.
    return this.prefixSum(index + 1) - this.prefixSum(index);
  }

  /** Largest index whose start offset is <= pixel, i.e. index containing `pixel`. */
  indexAt(pixel: number): number {
    if (this.n === 0) return 0;
    if (!Number.isFinite(pixel)) {
      return pixel > 0 ? this.n - 1 : 0;
    }
    let pos = 0;
    let rem = pixel;
    const highest = 2 ** Math.floor(Math.log2(this.n));
    for (let stride = highest; stride > 0; stride >>= 1) {
      const next = pos + stride;
      if (next <= this.n && this.tree[next]! <= rem) {
        pos = next;
        rem -= this.tree[next]!;
      }
    }
    // pos is the largest i with prefixSum(i) <= pixel; clamp inside bounds.
    return Math.max(0, Math.min(this.n - 1, pos));
  }

  private assertIndex(index: number, label: string): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.n) {
      throw new RangeError(
        `SizeIndex: ${label} must be an integer within [0, ${this.n - 1}], got ${index}`,
      );
    }
  }
}

function validateSize(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`SizeIndex: ${label} must be a finite non-negative number, got ${value}`);
  }
}

function validateCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`SizeIndex: ${label} must be a non-negative integer, got ${value}`);
  }
}
