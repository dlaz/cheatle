/**
 * Scorer Web Worker
 *
 * Runs the O(n²) sortCandidates() computation off the main thread so that
 * color-toggle clicks and keystrokes are never blocked by the lookahead
 * scoring algorithm.
 *
 * Protocol
 * --------
 * Incoming message: { candidates: string[] }
 *   - candidates: the filtered word list to rank
 *
 * Outgoing message: string[]
 *   - the same words in sorted order (best guess first)
 */

import { sortCandidates } from "./wordScorer";
import wordByFrequencyData from "../data/word_by_frequency.json";

const frequencyScores = wordByFrequencyData as Record<string, number>;

// Re-type self for the worker context. TypeScript (via the dom lib) types
// globalThis.self as Window; we need the DedicatedWorkerGlobalScope API.
type WorkerGlobal = typeof globalThis & {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(data: unknown): void;
};

const workerSelf = self as unknown as WorkerGlobal;

workerSelf.onmessage = (e: MessageEvent<{ candidates: string[] }>) => {
  const sorted = sortCandidates(e.data.candidates, undefined, frequencyScores);
  workerSelf.postMessage(sorted);
};
