describe("Top-level game behavior", () => {
  const typeWord = (word: string) => {
    // Ensure the window is focused
    cy.window().focus();
    cy.get("body").type(word, { delay: 50 });
  };

  const pressEnter = () => {
    cy.window().focus();
    cy.get("body").type("{enter}");
  };

  const markRowAllGreen = (row: number) => {
    for (let col = 0; col < 5; col++) {
      cy.get(`[data-testid="cell-${row}-${col}"]`, { timeout: 10000 }).click().click();
    }
  };

  beforeEach(() => {
    cy.visit("/");
    // Wait for the grid to be rendered
    cy.get('[data-testid="cell-0-0"]', { timeout: 10000 }).should("exist");
  });

  it("accepts keyboard input into the grid", () => {
    typeWord("ALERT");

    // Wait a bit for state to update
    cy.wait(500);

    cy.get('[data-testid="cell-0-0"]').should("contain", "A");
    cy.get('[data-testid="cell-0-1"]').should("contain", "L");
    cy.get('[data-testid="cell-0-2"]').should("contain", "E");
    cy.get('[data-testid="cell-0-3"]').should("contain", "R");
    cy.get('[data-testid="cell-0-4"]').should("contain", "T");
  });

  it("shows solve celebration and hides suggestions after an early all-green solve", () => {
    typeWord("ALERT");
    cy.wait(500);
    markRowAllGreen(0);
    cy.wait(300);
    pressEnter();
    cy.wait(1000);

    cy.get('[data-testid="celebration-row-0"]', { timeout: 10000 }).should("exist");

    // If suggestions were still visible, row 2 would render as a suggestion row
    // without editable cell test ids.
    cy.get('[data-testid="cell-2-0"]', { timeout: 10000 }).should("exist");
  });

  it("hides suggestions when the bottom row is all green", () => {
    // Fill rows 0-4 with all-green ALERT.
    for (let row = 0; row < 5; row++) {
      typeWord("ALERT");
      cy.wait(500);
      if (row === 0) {
        markRowAllGreen(0);
        cy.wait(500);
      }
      pressEnter();
      cy.wait(500);
    }

    // Row 5 auto-starts as green in all columns due to locked greens.
    typeWord("ALERT");
    cy.wait(200);

    // Suggestions should be hidden, so row 6 is a normal editable row.
    cy.get('[data-testid="cell-6-0"]', { timeout: 10000 }).should("exist");
  });
});
