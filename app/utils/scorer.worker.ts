/// <reference lib="webworker" />
/**
 * Scorer Web Worker
 *
 * Runs the O(n²) sortCandidates() computation off the main thread so that
 * color-toggle clicks and keystrokes are never blocked by the lookahead
 * scoring algorithm.
 *
 * Protocol
 * --------
 * Incoming message: { candidates: string[], requestId: number }
 *   - candidates:  the filtered word list to rank
 *   - requestId:   monotonically increasing id echoed back in the response so
 *                  the main thread can discard stale results
 *
 * Outgoing message: { sorted: string[], requestId: number }
 *   - sorted:     the same words in sorted order (best guess first)
 *   - requestId:  echoed back from the incoming message
 */

import { sortCandidates } from "./wordScorer";
import wordByFrequencyData from "../data/word_by_frequency.json";

const frequencyScores = wordByFrequencyData as Record<string, number>;

self.onmessage = (e: MessageEvent<{ candidates: string[]; requestId: number }>) => {
  const { candidates, requestId } = e.data;
  const sorted = sortCandidates(candidates, undefined, frequencyScores);
  self.postMessage({ sorted, requestId });
};
