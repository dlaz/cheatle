
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

/**
 * Computes expected remaining valid solutions after making a guess,
 * assuming each current solution is equally likely.
 */
export function expectedRemainingAfterGuess(guess: string, solutions: string[]): number {
  if (solutions.length === 0) return 0;

  const buckets = new Map<string, number>();
  for (const solution of solutions) {
    const key = getFeedbackPattern(guess, solution);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const total = solutions.length;
  let expected = 0;
  for (const count of buckets.values()) {
    expected += (count * count) / total;
  }
  return expected;
}

/**
 * Sort candidates by expected remaining solutions (lower is better).
 */
export function sortCandidates(candidates: string[]): string[] {
  if (candidates.length < 2) return candidates;

  const scored = candidates.map((guess) => ({
    guess,
    expectedRemaining: expectedRemainingAfterGuess(guess, candidates),
  }));

  scored.sort((a, b) => {
    if (a.expectedRemaining !== b.expectedRemaining) {
      return a.expectedRemaining - b.expectedRemaining;
    }
    return a.guess.localeCompare(b.guess);
  });

  return scored.map((entry) => entry.guess);
}
