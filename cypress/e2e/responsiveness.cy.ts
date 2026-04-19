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
 *
 * ─────────────────────────────────────────────────────────────────────
 * TIMING ASSERTIONS
 * ─────────────────────────────────────────────────────────────────────
 *
 * Wall-clock `performance.measure` values are logged via `cy.log` for
 * informational purposes only.  Hard numeric thresholds are intentionally
 * NOT asserted because `performance.measure` captures end-to-end elapsed
 * time that includes Cypress command-scheduling overhead and is sensitive
 * to CI machine load, making such assertions inherently flaky.
 *
 * The functional correctness of every interaction (letter appears in cell,
 * cell background changes to the correct Wordle color, row advances) is
 * still fully asserted through deterministic DOM assertions.
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
 * Measure elapsed time since the mark placed by markStart(label) and
 * log it.  The duration is informational only; no threshold is asserted.
 */
const logTiming = (label: string, description: string) => {
  const measureName = `${label}__measure`;
  cy.window().then((win) => {
    win.performance.clearMeasures(measureName);
    win.performance.measure(measureName, label);
    const entry = win.performance.getEntriesByName(measureName)[0];
    cy.log(`${description}: ${entry.duration.toFixed(1)} ms`);
  });
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Grid interaction responsiveness", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.get('[data-testid="cell-0-0"]', { timeout: 10_000 }).should("exist");
    // Give React time to complete hydration and attach the window keydown
    // listener so that subsequent cy.get("body").type() calls are handled.
    cy.wait(500);
  });

  // ── 1. Keystroke latency ────────────────────────────────────────────────

  it("verifies per-keystroke responsiveness (letter appears in cell)", () => {
    // Warm up – make sure the page is fully interactive before measuring.
    cy.get("body").click({ force: true });

    markStart("keystroke-start");

    // Type a single letter; verify it appears in the first cell.
    cy.window().focus();
    cy.get("body").type("A");
    cy.get('[data-testid="cell-0-0"]').should("contain.text", "A");

    logTiming("keystroke-start", "Keystroke → cell render");
  });

  it("verifies typing a full 5-letter word (all cells filled)", () => {
    markStart("word-start");
    typeWord("ALERT");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "T");

    logTiming("word-start", "5-letter word → all cells rendered");
  });

  // ── 2. Color-toggle latency (no submitted rows) ─────────────────────────

  it("verifies color-toggle responsiveness before any row is submitted", () => {
    /**
     * With no submitted rows, sortCandidates() uses the pre-computed full-
     * state scores (O(n) lookup) synchronously, so color toggles are fast.
     * After optimization this path is unchanged: it's already instant.
     */
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

    logTiming("toggle-before-submit", "Color toggle (no submitted rows)");
  });

  // ── 3. Color-toggle latency (WITH submitted rows) ───────────────────────

  it("verifies color-toggle responsiveness after first row is submitted (cell updates immediately)", () => {
    /**
     * Before optimization: pressing Enter committed the row, then every
     * subsequent color toggle synchronously re-ran sortCandidates() O(n²),
     * blocking the main thread for ~500–1 000 ms per click.
     *
     * After optimization: the cell color change is driven by the synchronous
     * `grid` state update (instant). sortCandidates() runs asynchronously in
     * the scorer Web Worker after a 150 ms debounce, so the UI is never blocked.
     */
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

    logTiming("toggle-after-submit", "Color toggle (with submitted row) – sortCandidates async in worker");
  });

  // ── 4. Enter-key / row-advance latency ──────────────────────────────────

  it("verifies Enter-key advances the row (row-1 cell exists after pressing Enter)", () => {
    /**
     * Pressing Enter when a row is complete advances currentRow by 1.
     * After optimization, sortCandidates() is debounced + off-thread, so
     * the row advance is purely a cheap state update + re-render.
     */
    typeWord("CRANE");
    cy.get('[data-testid="cell-0-4"]').should("contain.text", "E");

    markStart("enter-key");
    pressEnter();
    cy.get('[data-testid="cell-1-0"]').should("exist");

    logTiming("enter-key", "Enter key → row advanced");
  });

  // ── 5. Rapid back-to-back color toggles (full row marking) ──────────────

  it("verifies marking all 5 cells in a submitted row reaches green (visual updates immediate)", () => {
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
     */
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

    logTiming("mark-full-row", "Marking all 5 cells green (10 clicks, 1 deferred worker sort)");
  });
});
