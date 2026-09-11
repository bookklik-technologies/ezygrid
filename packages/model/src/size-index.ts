/**
 * Fenwick (binary indexed) tree over size deltas, supporting:
 * - prefix sum (pixel offset of index)
 * - prefix-sum search (index at pixel offset)
 * - point update (resize a row/column)
 * in O(log n) each, over an arbitrary logical dimension size.
 */
export class SizeIndex {
  private n: number;
  private tree: Float64Array & Record<number, number>;
  private defaultSize: number;

  constructor(logicalSize: number, defaultSize: number) {
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
    let sum = 0;
    for (let i = Math.min(count, this.n); i > 0; i -= i & -i) sum += this.tree[i]!;
    return sum;
  }

  totalSize(): number {
    return this.prefixSum(this.n);
  }

  /** Pixel offset of item `index` (0-based). */
  offsetOf(index: number): number {
    return this.prefixSum(index);
  }

  /** Update the size of item `index` (0-based) to `size`. */
  setSize(index: number, size: number): void {
    const current = this.sizeOf(index);
    const delta = size - current;
    for (let i = index + 1; i <= this.n; i += i & -i) {
      this.tree[i] = (this.tree[i] ?? 0) + delta;
    }
  }

  sizeOf(index: number): number {
    // size(i) = prefixSum(i+1) - prefixSum(i); fine for occasional queries.
    return this.prefixSum(index + 1) - this.prefixSum(index);
  }

  /** Largest index whose start offset is <= pixel, i.e. index containing `pixel`. */
  indexAt(pixel: number): number {
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
}
