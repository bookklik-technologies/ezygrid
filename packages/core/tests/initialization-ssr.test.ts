// @vitest-environment node
import { expect, it } from 'vitest';

it('imports the main and automatic entry points without browser globals', async () => {
  expect(typeof document).toBe('undefined');
  const core = await import('../src/index.js');
  const auto = await import('../src/auto.js');
  expect(auto.Ezygrid).toBe(core.Ezygrid);
  expect(core.createGrid().activeWorksheet.name).toBe('Sheet1');
  expect(() => new core.Ezygrid({ target: '#editor' })).toThrow(/document is required/);
  expect(() => core.Ezygrid.initAll()).toThrow(/document is required/);
});
