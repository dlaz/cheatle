/**
 * Responsiveness & Performance Tests for Cheatle Grid Interactions
 *
 * These tests quantify timing for keyboard input and cell color-toggle
 * interactions. They are designed to surface bottlenecks and provide a
 * baseline for verifying future optimizations.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IMPLEMENTATION NOTE (post-optimization)
 * ─────────────────────────────────────────────────────────────────────
 *
 * Two optimizations have been applied to GameGrid:
 *
 * Optimization 1 – Web Worker for sortCandidates()
 *   The O(n²) one-move-lookahead scoring that previously ran synchronously
 *   in a useMemo has been moved to a dedicated Web Worker.  The main thread
 *   posts the filtered candidate list and receives the sorted result
 *   asynchronously, so color-toggle clicks and keystrokes never block
 *   while scoring runs in the background.
 *
 * Optimization 2 – 150 ms debounce before dispatching to the worker
 *   Back-to-back color toggles on the same row (the common case when
 *   marking 5 cells) collapse into a single scoring pass instead of one
 *   per click.  The worker receives the latest filtered list only after
 *   the user has been idle for 150 ms, cutting the number of O(n²) passes
 *   by ~80 % for the typical "mark a whole row" workflow.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE TIMING TESTS MEASURE
 * ─────────────────────────────────────────────────────────────────────
 *
 * Cell color and letter updates are driven by the synchronous `grid` React
 * state, NOT by the async `candidates` state returned by the worker.  So
 * these tests measure the perceived responsiveness (how quickly the UI
 * reflects the user's input), not the background scoring completion time.
 *
 * Before optimization, every color-toggle blocked the UI thread until
 * sortCandidates() finished (~500–1 000 ms).  After optimization that
 * block is gone: the visual update is just a setState + re-render.
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
     * state scores (O(n) lookup) synchronously, so color toggles are fast.
     * After optimization this path is unchanged: it's already instant.
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

  it("quantifies color-toggle latency after first row is submitted (post-optimization: cell updates immediately)", () => {
    /**
     * Before optimization: pressing Enter committed the row, then every
     * subsequent color toggle synchronously re-ran sortCandidates() O(n²),
     * blocking the main thread for ~500–1 000 ms per click.
     *
     * After optimization: the cell color change is driven by the synchronous
     * `grid` state update (instant). sortCandidates() runs asynchronously in
     * the scorer Web Worker after a 150 ms debounce, so the UI is never blocked.
     *
     * The threshold has been tightened from 1 500 ms → 400 ms to enforce the
     * post-optimization expectation.
     */
    const THRESHOLD_MS = 400;

    typeWord("ALERT");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "T");
    pressEnter();
    // Wait for row 1 to become current (cursor moves to row 1)
    cy.get('[data-testid="cell-1-0"]').should("exist");

    markStart("toggle-after-submit");
    cy.get('[data-testid="cell-0-0"]').click(); // toggles a submitted cell
    cy.get('[data-testid="cell-0-0"]').should(
      "have.css",
      "background-color",
      "rgb(201, 180, 88)" // Wordle yellow – confirms render completed
    );

    measureFrom("toggle-after-submit", (ms) => {
      cy.log(`Color toggle (with submitted row): ${ms.toFixed(1)} ms`);
      cy.log("sortCandidates now runs async in worker after 150 ms debounce – no main-thread block.");
      expect(ms, "toggle with submitted rows").to.be.lessThan(THRESHOLD_MS);
    });
  });

  // ── 4. Enter-key / row-advance latency ──────────────────────────────────

  it("quantifies Enter-key latency (row advances within 300 ms)", () => {
    /**
     * Pressing Enter when a row is complete advances currentRow by 1.
     * After optimization, sortCandidates() is debounced + off-thread, so
     * the row advance is purely a cheap state update + re-render.
     */
    const THRESHOLD_MS = 300;

    typeWord("CRANE");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "E");

    markStart("enter-key");
    pressEnter();
    cy.get('[data-testid="cell-1-0"]').should("exist");

    measureFrom("enter-key", (ms) => {
      cy.log(`Enter key → row advanced: ${ms.toFixed(1)} ms`);
      expect(ms, "enter key row advance").to.be.lessThan(THRESHOLD_MS);
    });
  });

  // ── 5. Rapid back-to-back color toggles (full row marking) ──────────────

  it("quantifies marking all 5 cells in a submitted row (post-optimization: visual updates immediate)", () => {
    /**
     * Before optimization: 10 clicks → 10 synchronous sortCandidates() passes
     * back-to-back, each blocking the main thread (~500 ms each = ~5 000 ms).
     *
     * After optimization:
     * • Each click immediately updates the cell color via setGrid (O(1)).
     * • The 150 ms debounce resets on every click; sortCandidates runs once
     *   in the worker 150 ms after the last click.
     * • The test assertion is on cell color (driven by grid state), so it
     *   passes as soon as all 10 render cycles complete – no sorting wait.
     *
     * The threshold has been tightened from 3 000 ms → 800 ms.
     */
    const THRESHOLD_MS = 800;

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
      cy.log(`Marking all 5 cells green (10 clicks, 1 deferred worker sort): ${ms.toFixed(1)} ms`);
      expect(ms, "full row color marking").to.be.lessThan(THRESHOLD_MS);
    });
  });
});
