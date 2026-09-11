import { evaluateStandalone, shapeResult, type CalcRequest, type CalcResponse } from './worker.js';

/**
 * Dedicated calculation-worker entrypoint (§14.4). Bundle this file as a
 * worker script; importing the package root no longer registers message
 * handlers on the host environment.
 *
 * Build: esbuild --bundle src/worker-main.ts --format=esm --outfile=dist/calc-worker.js
 * Usage: new Worker(new URL('.../calc-worker.js'), { type: 'module' })
 */
const workerSelf = self as unknown as {
  onmessage: ((event: { data: CalcRequest }) => void) | null;
  postMessage: (message: CalcResponse) => void;
};

workerSelf.onmessage = (event: { data: CalcRequest }) => {
  const request = event.data;
  try {
    const result = evaluateStandalone(request.expression, request.values);
    workerSelf.postMessage({ id: request.id, result, matrix: shapeResult(result) });
  } catch (error) {
    workerSelf.postMessage({
      id: request.id,
      result: String((error as Error).message ?? error),
    });
  }
};
