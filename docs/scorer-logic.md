# Scorer Logic

This document describes the word-scoring and game-state logic implemented in `scorer.py`.

## WordScorer

`WordScorer` ranks every word in a given word list by how "common" its letters are **at each position**.

1. **Letter-position frequency**: For each position in the word (0 through *n*), count how many times each letter appears at that position across the entire word list.
2. **Word score**: A word's raw score is the sum of positional frequencies for each of its letters — i.e., for a word like `crane`, the score is `freq[0]['c'] + freq[1]['r'] + freq[2]['a'] + freq[3]['n'] + freq[4]['e']`.
3. **Ranking**: All candidate words are sorted by this score in ascending order and assigned a rank (index). Higher rank → more positionally common letters.

The scorer intentionally uses **positional** frequency rather than global letter frequency (the global-frequency approach is commented out in the code). This biases suggestions toward words whose letters appear frequently *in the right spots*, not just frequently overall.

## GameState

`GameState` maintains the evolving constraints of a Wordle-style game and uses them to filter and suggest words.

### Initialization

- Filters the master word list down to words of the target length (default 5).
- Builds a **start word** subset: words with no repeated letters (maximises information per guess).
- Creates a `WordScorer` over the full candidate set.
- Sorts both start words and all candidates by their scorer rank (best first).
- Initialises per-position candidate letter sets — every position starts with all 26 letters as possibilities.
- Tracks a set of **required letters** (letters confirmed to be in the answer via yellow clues).

### Processing a Guess (`move`)

For each position in the guess, the result character (`g`, `y`, or `x`) updates constraints:

| Result | Meaning | Constraint Update |
|--------|---------|-------------------|
| `g` (green) | Correct letter in correct position | Lock that position to only this letter. |
| `y` (yellow) | Correct letter in wrong position | Add letter to the required set; remove it from *this* position's candidates. |
| `x` (grey) | Letter not in the word | Remove letter from **all** unlocked positions — unless the same letter also appears as yellow in the current guess (handles duplicate-letter edge case). |

The guessed word is also removed from both the start-word and candidate-word lists.

### Suggesting Words (`suggest`)

- If no constraints have been applied yet (start state), return the ranked start words (no repeated letters, best-scored first).
- Otherwise, build a regex from the current constraints:
  - A character class per position allowing only remaining candidate letters.
  - Lookaheads enforcing every required (yellow) letter appears somewhere in the word.
- Filter the sorted candidate list through this regex and return matches, best-scored first.
