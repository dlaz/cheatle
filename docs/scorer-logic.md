# Scorer Logic

This document describes the current suggestion scoring used by the app.

## Candidate Ranking Strategy

Suggestions are ranked using an adaptive blend of:

1. Guess minimization (expected remaining solutions after the guess).
2. Word frequency (`app/data/word_by_frequency.json`).

The blend changes based on how many possible solutions remain.

## 1) Elimination Signal

For each candidate guess, the scorer simulates Wordle feedback (`g`, `y`, `x`) against every currently valid solution and computes:

$$
E[\text{remaining}] = \sum_{b \in \text{patterns}} \frac{|b|^2}{N}
$$

Where:
- $N$ is the number of current valid solutions.
- $|b|$ is the size of a feedback-pattern bucket.

Lower is better.

## 2) Frequency Signal

Each candidate also has a normalized frequency score from news-corpus data in `word_by_frequency.json`.

Higher is better.

## 3) Adaptive Weighting By Search Space Size

The implementation uses these thresholds:

- `candidateCount >= 80`: minimization weight = `0.9`
- `candidateCount <= 20`: minimization weight = `0.35`
- between `20` and `80`: linear interpolation between `0.35` and `0.9`

This means:

- early game (many candidates): prioritize elimination power
- late game (few candidates): prioritize likely/common solutions

## 4) Combined Score

Expected-remaining values and frequency values are each normalized across the current candidate set to $[0, 1]$.

Then each candidate gets:

$$
	ext{combined} = w_m \cdot \text{normExpected} + (1 - w_m) \cdot (1 - \text{normFrequency})
$$

Where:
- $w_m$ is the minimization weight from the thresholds above.
- lower `combined` is better.

Because this is a weighted score, frequency can affect ranking even when no exact ties exist.

## 5) Initial-State Performance Optimization

When no guesses have been submitted yet, the app can use precomputed elimination scores from `app/data/scored_words.json` instead of recomputing expected-remaining values on the fly.

The same adaptive blending and frequency logic still applies.

## 6) Deterministic Ordering

Final ordering is by:

1. lower combined score
2. lower expected remaining
3. higher frequency
4. alphabetical word order

