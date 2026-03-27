# Scorer Logic

This document describes the word-scoring and game-state logic implemented in `scorer.py`.

## WordScorer

`WordScorer` ranks every word in a given word list by how "common" its letters are **at each position**.

1. **Letter-position frequency**: For each position in the word (0 through *n*), count how many times each letter appears at that position across the entire word list.
2. **Word score**: A word's raw score is the sum of positional frequencies for each of its letters — i.e., for a word like `crane`, the score is `freq[0]['c'] + freq[1]['r'] + freq[2]['a'] + freq[3]['n'] + freq[4]['e']`.
3. **Ranking**: All candidate words are sorted by this score in ascending order and assigned a rank (index). Higher rank → more positionally common letters.

The scorer intentionally uses **positional** frequency rather than global letter frequency (the global-frequency approach is commented out in the code). This biases suggestions toward words whose letters appear frequently *in the right spots*, not just frequently overall.

