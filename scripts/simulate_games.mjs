#!/usr/bin/env node
/**
 * Simulate Wordle games to find optimal MANY_CANDIDATES_THRESHOLD and
 * FEW_CANDIDATES_THRESHOLD values by minimising average steps to solve.
 *
 * Only words with nonzero frequency (from word_by_frequency.json) are used
 * as solutions, mirroring the real-world distribution of Wordle answers.
 *
 * Usage:
 *   node scripts/simulate_games.mjs
 *   node scripts/simulate_games.mjs --update   # also patches wordScorer.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "app", "data");
const scorerPath = join(__dirname, "..", "app", "utils", "wordScorer.ts");

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const words = JSON.parse(readFileSync(join(dataDir, "words.json"), "utf8"));
const frequencyData = JSON.parse(
  readFileSync(join(dataDir, "word_by_frequency.json"), "utf8")
);
const scoredWordsData = JSON.parse(
  readFileSync(join(dataDir, "scored_words.json"), "utf8")
);

// Words with nonzero frequency are the simulated solutions.
const solutions = words.filter((w) => (frequencyData[w] ?? 0) > 0);
const solutionSet = new Set(solutions);

console.log(
  `Loaded ${words.length} words, ${solutions.length} nonzero-frequency solutions.`
);

// ---------------------------------------------------------------------------
// Core feedback functions (mirrors app/utils/wordScorer.ts)
// ---------------------------------------------------------------------------

// Shared buffers used by feedbackCode() and expRemaining().
//   _rem – per-letter count of unmatched solution letters (indexed a=0..z=25)
//   _st  – per-position feedback state (0=gray, 1=yellow, 2=green)
//   _bkt – per-feedback-code bucket counters (3^5 = 243 possible codes)
// Sharing is safe because JavaScript is single-threaded and these functions
// are never re-entered before they return.
const _rem = new Int32Array(26);
const _st  = new Int32Array(5);
const _bkt = new Uint32Array(243);

/**
 * Encodes Wordle feedback as a base-3 integer (0=gray, 1=yellow, 2=green).
 * Result 242 ("ggggg") means the guess is correct.
 */
function feedbackCode(guess, sol) {
  _rem.fill(0);
  _st.fill(0);
  for (let i = 0; i < 5; i++) {
    if (guess.charCodeAt(i) === sol.charCodeAt(i)) {
      _st[i] = 2;
    } else {
      _rem[sol.charCodeAt(i) - 97]++;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (_st[i] === 2) continue;
    const c = guess.charCodeAt(i) - 97;
    if (_rem[c] > 0) { _st[i] = 1; _rem[c]--; }
  }
  return _st[0] * 81 + _st[1] * 27 + _st[2] * 9 + _st[3] * 3 + _st[4];
}

const CORRECT_CODE = 242; // "ggggg"

/**
 * Expected remaining solutions after guessing `guess` against `cands`.
 * Uses the shared _bkt buffer.
 */
function expRemaining(guess, cands) {
  _bkt.fill(0);
  for (const s of cands) _bkt[feedbackCode(guess, s)]++;
  let sq = 0;
  for (const c of _bkt) sq += c * c;
  return sq / cands.length;
}

// ---------------------------------------------------------------------------
// sortCandidates (mirrors app/utils/wordScorer.ts, with threshold params)
// ---------------------------------------------------------------------------

function sortCandidates(cands, precomp, freqs, manyT, fewT) {
  const n = cands.length;
  if (n < 2) return cands.slice();

  let mw;
  if (n >= manyT)      mw = 0.9;
  else if (n <= fewT)  mw = 0.35;
  else                 mw = 0.35 + (n - fewT) / (manyT - fewT) * 0.55;

  let minE = Infinity, maxE = -Infinity;
  let minF = Infinity, maxF = -Infinity;
  const er = new Float64Array(n);
  const fr = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const g = cands[i];
    er[i] = precomp
      ? (precomp[g.toLowerCase()] ?? Infinity)
      : expRemaining(g, cands);
    fr[i] = freqs[g.toLowerCase()] ?? 0;
    if (isFinite(er[i])) {
      if (er[i] < minE) minE = er[i];
      if (er[i] > maxE) maxE = er[i];
    }
    if (fr[i] < minF) minF = fr[i];
    if (fr[i] > maxF) maxF = fr[i];
  }

  if (!isFinite(minE)) { minE = 0; maxE = 1; }
  const eR = maxE - minE;
  const fR = maxF - minF;

  const sc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ne = !isFinite(er[i]) ? 1 : (eR > 0 ? (er[i] - minE) / eR : 0);
    const nf = fR > 0 ? (fr[i] - minF) / fR : 0;
    sc[i] = mw * ne + (1 - mw) * (1 - nf);
  }

  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) =>
    sc[a] !== sc[b]   ? sc[a] - sc[b] :
    er[a] !== er[b]   ? er[a] - er[b] :
    fr[b] !== fr[a]   ? fr[b] - fr[a] :
    cands[a].localeCompare(cands[b])
  );
  return idx.map((i) => cands[i]);
}

// ---------------------------------------------------------------------------
// Tree-based simulation
// ---------------------------------------------------------------------------
// Rather than simulating each of the 1298 solutions independently (which calls
// sortCandidates O(solutions) times at each depth), we walk a game tree.
// All solutions sharing the same candidate set at any depth use the same next
// guess – sortCandidates is called once per UNIQUE candidate set instead of
// once per solution.  This collapses 1298 step-1 sorts into ≤178 sorts (one
// per unique step-0 feedback bucket), giving a ~7–37× speedup.

const MAX_GUESSES = 6;

/**
 * Recursively walk the game tree rooted at (candidates, guess, depth).
 *
 * allCands  – all words that are still valid given clues so far
 * solsHere  – the subset of `solutions` among allCands
 * guess     – the word being played at this depth
 * depth     – number of guesses used so far (1-indexed)
 *
 * Returns { totalSteps, maxSteps, failed } accumulated over solsHere.
 */
function walkTree(allCands, solsHere, guess, freqs, manyT, fewT, depth) {
  if (solsHere.length === 0) return { totalSteps: 0, maxSteps: 0, failed: 0 };

  // Partition candidates and solutions by feedback code.
  const candBuckets = new Map();
  for (const w of allCands) {
    const code = feedbackCode(guess, w);
    if (!candBuckets.has(code)) candBuckets.set(code, []);
    candBuckets.get(code).push(w);
  }

  const solBuckets = new Map();
  for (const sol of solsHere) {
    const code = feedbackCode(guess, sol);
    if (!solBuckets.has(code)) solBuckets.set(code, []);
    solBuckets.get(code).push(sol);
  }

  let totalSteps = 0, maxSteps = 0, failed = 0;

  for (const [code, solBucket] of solBuckets) {
    if (code === CORRECT_CODE) {
      // All solutions in solBucket were solved at this depth.
      totalSteps += depth * solBucket.length;
      if (depth > maxSteps) maxSteps = depth;
      continue;
    }

    const steps = depth + 1; // we'll need at least one more guess

    if (depth >= MAX_GUESSES) {
      // Ran out of guesses.
      totalSteps += steps * solBucket.length;
      if (steps > maxSteps) maxSteps = steps;
      failed += solBucket.length;
      continue;
    }

    const candBucket = candBuckets.get(code) ?? [];
    if (candBucket.length === 0) {
      // Shouldn't happen; treat as failure.
      totalSteps += steps * solBucket.length;
      if (steps > maxSteps) maxSteps = steps;
      failed += solBucket.length;
      continue;
    }

    // Compute next guess ONCE for this sub-bucket.
    const nextGuess = sortCandidates(candBucket, null, freqs, manyT, fewT)[0];

    // Recurse.
    const sub = walkTree(candBucket, solBucket, nextGuess, freqs, manyT, fewT, depth + 1);
    totalSteps += sub.totalSteps;
    if (sub.maxSteps > maxSteps) maxSteps = sub.maxSteps;
    failed += sub.failed;
  }

  return { totalSteps, maxSteps, failed };
}

/**
 * Run a full simulation for a given threshold combination.
 * Returns { avg, max, failed, firstGuess }.
 */
function runCombo(freqs, precomp, manyT, fewT) {
  // Determine the first guess using precomputed scores.
  const firstGuess = sortCandidates(words, precomp, freqs, manyT, fewT)[0];

  const { totalSteps, maxSteps, failed } = walkTree(
    words, solutions, firstGuess, freqs, manyT, fewT, /* depth= */ 1
  );

  return {
    avg: totalSteps / solutions.length,
    max: maxSteps,
    failed,
    firstGuess,
  };
}

// ---------------------------------------------------------------------------
// Grid search over threshold values
// ---------------------------------------------------------------------------

const MANY_VALUES = [30, 50, 70, 80, 100, 150, 200, 300];
const FEW_VALUES  = [2, 5, 8, 10, 15, 20, 25, 30];

const totalCombos = MANY_VALUES.flatMap((m) =>
  FEW_VALUES.filter((f) => f < m)
).length;

console.log(
  `Testing ${totalCombos} threshold combinations over ${solutions.length} solutions…\n`
);

const header = "MANY   FEW   avg_steps  max_steps  failed  first_guess";
console.log(header);
console.log("-".repeat(header.length));

let bestAvg = Infinity;
let bestMany = null;
let bestFew  = null;
let bestResult = null;
const allResults = [];

for (const many of MANY_VALUES) {
  for (const few of FEW_VALUES) {
    if (few >= many) continue;

    const result = runCombo(frequencyData, scoredWordsData, many, few);
    allResults.push({ many, few, ...result });

    const isBetter =
      result.avg < bestAvg ||
      (result.avg === bestAvg && result.max < (bestResult?.max ?? Infinity));

    if (isBetter) {
      bestAvg    = result.avg;
      bestMany   = many;
      bestFew    = few;
      bestResult = { many, few, ...result };
    }

    console.log(
      `${String(many).padEnd(7)}` +
      `${String(few).padEnd(6)}` +
      `${result.avg.toFixed(4).padEnd(11)}` +
      `${String(result.max).padEnd(11)}` +
      `${String(result.failed).padEnd(8)}` +
      result.firstGuess
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(60)}`);
console.log("Best result:");
console.log(`  MANY_CANDIDATES_THRESHOLD = ${bestMany}`);
console.log(`  FEW_CANDIDATES_THRESHOLD  = ${bestFew}`);
console.log(`  Average steps: ${bestResult.avg.toFixed(4)}`);
console.log(`  Max steps:     ${bestResult.max}`);
console.log(`  Failed games:  ${bestResult.failed}`);
console.log(`  First guess:   ${bestResult.firstGuess}`);

// ---------------------------------------------------------------------------
// Optional: patch wordScorer.ts with the discovered thresholds
// ---------------------------------------------------------------------------

// Constant names as they appear in the source file – centralised here so a
// rename in wordScorer.ts only requires updating these two strings.
const MANY_CONST_NAME = "MANY_CANDIDATES_THRESHOLD";
const FEW_CONST_NAME  = "FEW_CANDIDATES_THRESHOLD";

if (process.argv.includes("--update")) {
  const src = readFileSync(scorerPath, "utf8");
  const updated = src
    .replace(
      new RegExp(`^export const ${MANY_CONST_NAME} = \\d+;`, "m"),
      `export const ${MANY_CONST_NAME} = ${bestMany};`
    )
    .replace(
      new RegExp(`^export const ${FEW_CONST_NAME} = \\d+;`, "m"),
      `export const ${FEW_CONST_NAME} = ${bestFew};`
    );

  if (updated === src) {
    console.log(
      "\n⚠  wordScorer.ts was not modified (constants not found or already match)."
    );
  } else {
    writeFileSync(scorerPath, updated, "utf8");
    console.log(`\n✓ Updated ${scorerPath}`);
  }
}
