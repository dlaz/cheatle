/**
 * A function that sorts a list of candidate words.
 */
export type WordSorter = (words: string[]) => string[];

/**
 * Sorts candidates by letter frequency. Words with more common letters (in the
 * context of the remaining candidate set) are ranked higher.
 *
 * This is a good default strategy to maximize information gain from guesses.
 */
export const byFrequency: WordSorter = (words: string[]): string[] => {
  if (words.length < 2) {
    return words;
  }

  const letterCounts = new Map<string, number>();
  for (const word of words) {
    for (const letter of word) {
      letterCounts.set(letter, (letterCounts.get(letter) || 0) + 1);
    }
  }

  const score = (word: string): number => {
    // Score is sum of frequencies of unique letters.
    // Using unique letters encourages exploring more of the alphabet.
    const uniqueLetters = new Set(word.split(""));
    let s = 0;
    for (const letter of uniqueLetters) {
      s += letterCounts.get(letter) || 0;
    }
    return s;
  };

  return words.slice().sort((a, b) => score(b) - score(a));
};
