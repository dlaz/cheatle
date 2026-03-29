# Scorer Logic

This document describes the current suggestion scoring used by the app.

## Elimination-First Ranking

Suggestions are ranked by how strongly they shrink the remaining solution set.

For each candidate guess:

1. Simulate the Wordle feedback pattern (`g`, `y`, `x`) against every currently valid solution.
2. Group solutions by the resulting feedback pattern.
3. Compute expected remaining candidates as:

$$
E[\text{remaining}] = \sum_{b \in \text{patterns}} \frac{|b|^2}{N}
$$

Where:
- $N$ is the number of current valid solutions.
- $|b|$ is the size of a pattern bucket.

Lower expected value is better, because it means that after seeing feedback from that guess, the next candidate set is likely to be smaller.

## Tie-Breaking

- Ties are resolved alphabetically for deterministic output.

