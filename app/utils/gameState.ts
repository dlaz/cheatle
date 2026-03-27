import { sortCandidates } from "./wordScorer";

export type ResultChar = "g" | "y" | "x";

export class GameState {
  private size: number;
  private candidateWords: Set<string>;
  private startWords: Set<string>;
  /** Per-position set of still-possible letters. */
  private candidateLetters: Set<string>[];
  /** Letters confirmed present (yellow clues). */
  private requiredLetters: Set<string>;

  constructor(wordList: string[], size: number = 5) {
    this.size = size;

    // Words of the right length
    this.candidateWords = new Set(wordList.filter((w) => w.length === size));

    // Start words: no repeated letters
    this.startWords = new Set(
      [...this.candidateWords].filter((w) => new Set(w).size === w.length)
    );

    // Every position starts with all 26 letters
    const alpha = "abcdefghijklmnopqrstuvwxyz";
    this.candidateLetters = Array.from({ length: size }, () => new Set(alpha.split("")));

    this.requiredLetters = new Set();
  }

  private isStartState(): boolean {
    return this.candidateLetters.every((s) => s.size === 26);
  }

  /**
   * Apply a guess and its result to update constraints.
   * @param word  The guessed word (lowercase).
   * @param result A string of length `size` where each char is 'g', 'y', or 'x'.
   */
  move(word: string, result: ResultChar[]): void {
    this.candidateWords.delete(word);
    this.startWords.delete(word);

    // Letters that are yellow in this guess — protects them from grey removal
    const dontRemoveIfGrey = new Set<string>();
    for (let i = 0; i < this.size; i++) {
      if (result[i] === "y" || result[i] === "g") {
        dontRemoveIfGrey.add(word[i]);
      }
    }

    for (let pos = 0; pos < this.size; pos++) {
      const letter = word[pos];
      const r = result[pos];

      if (r === "g") {
        // Lock position to this letter
        this.candidateLetters[pos] = new Set([letter]);
      } else if (r === "y") {
        this.requiredLetters.add(letter);
        // Letter isn't at this position
        this.candidateLetters[pos].delete(letter);
      } else if (r === "x") {
        if (!dontRemoveIfGrey.has(letter)) {
          // Remove from every unlocked position
          for (let j = 0; j < this.size; j++) {
            if (this.candidateLetters[j].size > 1) {
              this.candidateLetters[j].delete(letter);
            }
          }
        }
      }
    }
  }

  /**
   * Return candidate words filtered by current constraints, sorted best-first
   * by positional letter frequency.
   */
  suggest(): string[] {
    const pool = this.isStartState()
      ? [...this.startWords]
      : [...this.candidateWords];

    const filtered = pool.filter((w) => {
      // Check per-position constraints
      for (let i = 0; i < this.size; i++) {
        if (!this.candidateLetters[i].has(w[i])) return false;
      }
      // Check required letters
      for (const req of this.requiredLetters) {
        if (!w.includes(req)) return false;
      }
      return true;
    });

    return sortCandidates(filtered);
  }
}
