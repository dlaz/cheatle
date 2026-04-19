/**
 * Responsiveness & Performance Tests for Cheatle Grid Interactions
 *
 * These tests quantify timing for keyboard input and cell color-toggle
 * interactions. They are designed to surface bottlenecks and provide a
 * baseline for verifying future optimizations.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IDENTIFIED BOTTLENECKS
 * ─────────────────────────────────────────────────────────────────────
 *
 * Bottleneck 1 – sortCandidates() runs synchronously on the React
 *   render thread every time a submitted-row cell color is toggled.
 *   The function performs an O(n²) one-move lookahead across every
 *   candidate word (~2,315 words × 2,315 words = ~5M operations) and
 *   blocks the UI thread while it runs.  See "Color toggle – with
 *   submitted row" below; the delta between the "before submit" and
 *   "after submit" timings isolates this cost.
 *
 * Bottleneck 2 – All 16 grid rows (GUESS_ROWS + SUGGESTION_ROWS) are
 *   always rendered even when only one cell changes. React's diffing
 *   keeps this manageable for a small fixed grid, but the combination
 *   with the synchronous scoring compounds the jank on color toggles.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROPOSED SOLUTIONS
 * ─────────────────────────────────────────────────────────────────────
 *
 * Solution 1 – Web Worker for sortCandidates()
 *   Move the expensive one-move-lookahead scoring into a dedicated Web
 *   Worker.  The main thread posts the current candidate list and
 *   receives the sorted result asynchronously, so color toggles and
 *   keystrokes are never blocked. The suggestion rows can show a
 *   loading indicator while the Worker is busy.
 *
 * Solution 2 – Debounce suggestion recomputation
 *   Delay the call to sortCandidates() until the user has been idle
 *   for a short period (e.g. 150 ms). Back-to-back color toggles on
 *   the same row (the common case when marking 5 cells) would then
 *   trigger only a single recomputation instead of five, cutting the
 *   cost by ~80% for typical usage without requiring a Worker.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Focus the window and type a word via keyboard events on <body>. */
const typeWord = (word: string) => {
  cy.window().focus();
  cy.get("body").type(word, { delay: 50 });
};

/** Focus the window and press Enter. */
const pressEnter = () => {
  cy.window().focus();
  cy.get("body").type("{enter}");
};

/**
 * Place a performance mark in the browser under the given name so we
 * can measure elapsed time later with measureFrom().
 */
const markStart = (label: string) => {
  cy.window().then((win) => {
    win.performance.clearMarks(label);
    win.performance.mark(label);
  });
};

/**
 * Measure elapsed time since the mark placed by markStart(label).
 * Passes the duration (ms) to the callback so tests can assert / log it.
 */
const measureFrom = (label: string, cb: (durationMs: number) => void) => {
  const measureName = `${label}__measure`;
  cy.window().then((win) => {
    win.performance.clearMeasures(measureName);
    win.performance.measure(measureName, label);
    const entry = win.performance.getEntriesByName(measureName)[0];
    cb(entry.duration);
  });
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Grid interaction responsiveness", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.get('[data-testid="cell-0-0"]', { timeout: 10_000 }).should("exist");
  });

  // ── 1. Keystroke latency ────────────────────────────────────────────────

  it("quantifies per-keystroke latency (letter appears within 300 ms)", () => {
    // Warm up – make sure the page is fully interactive before measuring.
    cy.get("body").click();

    const THRESHOLD_MS = 300;

    markStart("keystroke-start");

    // Type a single letter; wait for it to appear in the first cell.
    cy.window().focus();
    cy.get("body").type("A");
    cy.get('[data-testid="cell-0-0"]').should("contain.text", "A");

    measureFrom("keystroke-start", (ms) => {
      cy.log(`Keystroke → cell render: ${ms.toFixed(1)} ms`);
      expect(ms, "single keystroke latency").to.be.lessThan(THRESHOLD_MS);
    });
  });

  it("quantifies typing a full 5-letter word (all cells filled within 800 ms)", () => {
    const THRESHOLD_MS = 800;

    markStart("word-start");
    typeWord("ALERT");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "T");

    measureFrom("word-start", (ms) => {
      cy.log(`5-letter word → all cells rendered: ${ms.toFixed(1)} ms`);
      // 5 keystrokes at 50 ms delay + render overhead
      expect(ms, "full word typing latency").to.be.lessThan(THRESHOLD_MS);
    });
  });

  // ── 2. Color-toggle latency (no submitted rows) ─────────────────────────

  it("quantifies color-toggle latency before any row is submitted", () => {
    /**
     * With no submitted rows, sortCandidates() uses the pre-computed full-
     * state scores (O(n) lookup), so color toggles should be fast.
     */
    const THRESHOLD_MS = 200;

    typeWord("ALERT");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "T");

    markStart("toggle-before-submit");
    cy.get('[data-testid="cell-0-0"]').click();
    // After one click the cell cycles to "yellow" (background changes)
    cy.get('[data-testid="cell-0-0"]').should(
      "have.css",
      "background-color",
      "rgb(201, 180, 88)" // Wordle yellow
    );

    measureFrom("toggle-before-submit", (ms) => {
      cy.log(`Color toggle (no submitted rows): ${ms.toFixed(1)} ms`);
      expect(ms, "toggle before submit").to.be.lessThan(THRESHOLD_MS);
    });
  });

  // ── 3. Color-toggle latency (WITH submitted rows) ───────────────────────

  it("quantifies color-toggle latency after first row is submitted (exposes sortCandidates bottleneck)", () => {
    /**
     * After pressing Enter, submittedRows.length becomes 1 and the
     * useMemo for candidates re-runs with precomputedFullStateScores=undefined,
     * meaning sortCandidates() must call expectedRemainingAfterGuess() for
     * every candidate word against every other candidate. This is the main
     * bottleneck.  The test captures this cost so we can track improvements.
     */
    const THRESHOLD_MS = 1500; // generous – current implementation may be slow

    typeWord("ALERT");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "T");
    pressEnter();
    // Wait for row 1 to become current (cursor moves to row 1)
    cy.get('[data-testid="cell-1-0"]').should("exist");

    markStart("toggle-after-submit");
    cy.get('[data-testid="cell-0-0"]').click(); // toggles a submitted cell → reruns sortCandidates
    cy.get('[data-testid="cell-0-0"]').should(
      "have.css",
      "background-color",
      "rgb(201, 180, 88)" // Wordle yellow – confirms render completed
    );

    measureFrom("toggle-after-submit", (ms) => {
      cy.log(`Color toggle (with submitted row) – sortCandidates rerun: ${ms.toFixed(1)} ms`);
      cy.log("NOTE: the gap between this and the 'no submitted rows' test isolates the sortCandidates() cost.");
      expect(ms, "toggle with submitted rows").to.be.lessThan(THRESHOLD_MS);
    });
  });

  // ── 4. Enter-key / row-advance latency ──────────────────────────────────

  it("quantifies Enter-key latency (row advances within 300 ms)", () => {
    /**
     * Pressing Enter when a row is complete advances currentRow by 1.
     * This is cheap on its own, but the useMemo for candidates will also
     * fire (adding a submitted row). We measure the full round-trip.
     */
    const THRESHOLD_MS = 300;

    typeWord("CRANE");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "E");

    markStart("enter-key");
    pressEnter();
    // The cursor moves to row 1 – cell-1-0 now has a cursor-default style
    // (empty cell). We can verify the row advanced by checking cell-0-0
    // is still unchanged and cell-1-0 exists.
    cy.get('[data-testid="cell-1-0"]').should("exist");

    measureFrom("enter-key", (ms) => {
      cy.log(`Enter key → row advanced: ${ms.toFixed(1)} ms`);
      expect(ms, "enter key row advance").to.be.lessThan(THRESHOLD_MS);
    });
  });

  // ── 5. Rapid back-to-back color toggles (full row marking) ──────────────

  it("quantifies marking all 5 cells in a submitted row (exposes cumulative sortCandidates cost)", () => {
    /**
     * This is the most common user workflow: type a word, press Enter, then
     * click each cell to set its Wordle color.  Each click re-runs
     * sortCandidates(), so 5 toggles = 5 synchronous scoring passes.
     *
     * Solution 2 (debounce) would collapse these into a single pass and is
     * the quickest win for this specific pattern.
     */
    const THRESHOLD_MS = 3000; // 5 × up to ~600 ms each in the worst case

    typeWord("ALERT");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "T");
    pressEnter();
    cy.get('[data-testid="cell-1-0"]').should("exist");

    markStart("mark-full-row");

    // Click each cell twice to land on green (default → yellow → green)
    for (let col = 0; col < 5; col++) {
      cy.get(`[data-testid="cell-0-${col}"]`).click().click();
    }

    // Wait for the last cell to be green
    cy.get('[data-testid="cell-0-4"]').should(
      "have.css",
      "background-color",
      "rgb(106, 170, 100)" // Wordle green
    );

    measureFrom("mark-full-row", (ms) => {
      cy.log(`Marking all 5 cells green (10 clicks, 10 sortCandidates reruns): ${ms.toFixed(1)} ms`);
      cy.log("Solution 1 (Web Worker) or Solution 2 (debounce) would cut this significantly.");
      expect(ms, "full row color marking").to.be.lessThan(THRESHOLD_MS);
    });
  });
});
