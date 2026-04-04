
/**
 * Returns the Wordle-style result pattern for a guess against a solution.
 *
 * Pattern chars:
 * - g = green
 * - y = yellow
 * - x = gray
 */
export function getFeedbackPattern(guess: string, solution: string): string {
  const len = guess.length;
  const pattern = Array<string>(len).fill("x");
  const remaining = new Map<string, number>();

  // First pass: greens and remaining solution letters.
  for (let i = 0; i < len; i++) {
    if (guess[i] === solution[i]) {
      pattern[i] = "g";
      continue;
    }

    const ch = solution[i];
    remaining.set(ch, (remaining.get(ch) ?? 0) + 1);
  }

  // Second pass: yellows where any unmatched copy remains.
  for (let i = 0; i < len; i++) {
    if (pattern[i] === "g") continue;

    const ch = guess[i];
    const count = remaining.get(ch) ?? 0;
    if (count > 0) {
      pattern[i] = "y";
      remaining.set(ch, count - 1);
    }
  }

  return pattern.join("");
}

const FEEDBACK_BUCKETS = 243; // 3^5 patterns for Wordle-style feedback.

/**
 * Encodes Wordle feedback as a base-3 integer where:
 * - 0 = gray, 1 = yellow, 2 = green
 */
function getFeedbackCode(guess: string, solution: string): number {
  const len = guess.length;
  const states = Array<number>(len).fill(0);
  const remaining = new Map<string, number>();

  // First pass: mark greens and count remaining solution letters.
  for (let i = 0; i < len; i++) {
    if (guess[i] === solution[i]) {
      states[i] = 2;
      continue;
    }

    const ch = solution[i];
    remaining.set(ch, (remaining.get(ch) ?? 0) + 1);
  }

  // Second pass: mark yellows where unmatched copies remain.
  for (let i = 0; i < len; i++) {
    if (states[i] === 2) continue;

    const ch = guess[i];
    const count = remaining.get(ch) ?? 0;
    if (count > 0) {
      states[i] = 1;
      remaining.set(ch, count - 1);
    }
  }

  let code = 0;
  for (let i = 0; i < len; i++) {
    code = code * 3 + states[i];
  }
  return code;
}

/**
 * Computes expected remaining valid solutions after making a guess,
 * assuming each current solution is equally likely.
 */
export function expectedRemainingAfterGuess(guess: string, solutions: string[]): number {
  if (solutions.length === 0) return 0;

  const buckets = new Uint32Array(FEEDBACK_BUCKETS);
  for (const solution of solutions) {
    const code = getFeedbackCode(guess, solution);
    buckets[code] += 1;
  }

  const total = solutions.length;
  let squaredSum = 0;
  for (const count of buckets) {
    squaredSum += count * count;
  }
  return squaredSum / total;
}

/**
 * Sort candidates by one-move lookahead: expected remaining solutions
 * after the guess (lower is better).
 *
 * If precomputedFullStateScores is provided, those scores are used directly.
 * This keeps the initial all-words state fast while preserving exact lookahead
 * for subsequent narrowed states.
 */
export function sortCandidates(
  candidates: string[],
  precomputedFullStateScores?: Record<string, number>,
  frequencyScores?: Record<string, number>
): string[] {
  if (candidates.length < 2) return candidates;

  // Shift strategy by search space size:
  // - many candidates: prioritize elimination (min expected remaining)
  // - few candidates: prioritize likely/common solutions (frequency)
  const MANY_CANDIDATES_THRESHOLD = 80;
  const FEW_CANDIDATES_THRESHOLD = 20;

  const getMinimizationWeight = (candidateCount: number): number => {
    if (candidateCount >= MANY_CANDIDATES_THRESHOLD) return 0.9;
    if (candidateCount <= FEW_CANDIDATES_THRESHOLD) return 0.35;

    const progress =
      (candidateCount - FEW_CANDIDATES_THRESHOLD) /
      (MANY_CANDIDATES_THRESHOLD - FEW_CANDIDATES_THRESHOLD);
    return 0.35 + progress * (0.9 - 0.35);
  };

  const getFrequency = (word: string) => frequencyScores?.[word.toLowerCase()] ?? 0;

  const scoreCandidates = (
    entries: Array<{ guess: string; expectedRemaining: number; frequency: number }>
  ) => {
    const minimizationWeight = getMinimizationWeight(candidates.length);

    const finiteExpected = entries
      .map((entry) => entry.expectedRemaining)
      .filter((value) => Number.isFinite(value));

    const minExpected = finiteExpected.length > 0 ? Math.min(...finiteExpected) : 0;
    const maxExpected = finiteExpected.length > 0 ? Math.max(...finiteExpected) : 1;
    const expectedRange = maxExpected - minExpected;

    const frequencies = entries.map((entry) => entry.frequency);
    const minFrequency = Math.min(...frequencies);
    const maxFrequency = Math.max(...frequencies);
    const frequencyRange = maxFrequency - minFrequency;

    const withCombinedScore = entries.map((entry) => {
      const normalizedExpected = Number.isFinite(entry.expectedRemaining)
        ? expectedRange > 0
          ? (entry.expectedRemaining - minExpected) / expectedRange
          : 0
        : 1;

      const normalizedFrequency = frequencyRange > 0
        ? (entry.frequency - minFrequency) / frequencyRange
        : 0;

      const combinedScore =
        minimizationWeight * normalizedExpected +
        (1 - minimizationWeight) * (1 - normalizedFrequency);

      return {
        ...entry,
        combinedScore,
      };
    });

    withCombinedScore.sort((a, b) => {
      if (a.combinedScore !== b.combinedScore) {
        return a.combinedScore - b.combinedScore;
      }
      if (a.expectedRemaining !== b.expectedRemaining) {
        return a.expectedRemaining - b.expectedRemaining;
      }
      if (a.frequency !== b.frequency) return b.frequency - a.frequency;
      return a.guess.localeCompare(b.guess);
    });

    return withCombinedScore.map((entry) => entry.guess);
  };

  if (precomputedFullStateScores) {
    const scored = candidates.map((guess) => ({
      guess,
      expectedRemaining: precomputedFullStateScores[guess.toLowerCase()] ?? Number.POSITIVE_INFINITY,
      frequency: getFrequency(guess),
    }));
    return scoreCandidates(scored);
  }

  const scored = candidates.map((guess) => ({
    guess,
    expectedRemaining: expectedRemainingAfterGuess(guess, candidates),
    frequency: getFrequency(guess),
  }));
  return scoreCandidates(scored);
}
