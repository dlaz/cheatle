
/**
 * Scores words by sum of per-position letter frequencies in the candidate list.
 */
export class WordScorer {
  private _rankedWords: Map<string, number>;

  constructor(wordList: string[]) {
    const size = wordList.length > 0 ? wordList[0].length : 0;

    // Count letter frequency at each position
    const posFreq: Map<string, number>[] = Array.from({ length: size }, () => new Map());
    for (const w of wordList) {
      for (let i = 0; i < w.length; i++) {
        const ch = w[i];
        posFreq[i].set(ch, (posFreq[i].get(ch) ?? 0) + 1);
      }
    }

    // Score each word = sum of positional frequencies
    const scored: [string, number][] = wordList.map((w) => {
      let s = 0;
      for (let i = 0; i < w.length; i++) {
        s += posFreq[i].get(w[i]) ?? 0;
      }
      return [w, s];
    });

    // Sort ascending by score, then assign rank (index)
    scored.sort((a, b) => a[1] - b[1]);

    this._rankedWords = new Map<string, number>();
    for (let i = 0; i < scored.length; i++) {
      this._rankedWords.set(scored[i][0], i);
    }
  }

  /** Higher rank = more common positional letters. */
  score(word: string): number {
    return this._rankedWords.get(word) ?? 0;
  }
}

/**
 * Given a filtered candidate list, build a scorer and return candidates
 * sorted best-first (highest score first).
 */
export function sortCandidates(candidates: string[]): string[] {
  if (candidates.length === 0) return [];
  const scorer = new WordScorer(candidates);
  return [...candidates].sort((a, b) => scorer.score(b) - scorer.score(a));
}
