import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import GameGrid from "./GameGrid";

jest.mock("../data/words.json", () => [
  "alert",
  "arose",
  "befit",
  "belly",
  "bland",
  "clamp",
  "cello",
  "elfin",
  "ethic",
  "flame",
  "glint",
  "lined",
  "merit",
  "petit",
  "refit",
]);

describe("GameGrid", () => {
  it("shows all possible words sorted alphabetically in debug view", () => {
    render(<GameGrid />);

    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));

    // Check that the debug display shows the words (separated by commas and spaces)
    const debugText = screen.getByText(/alert.*refit/);
    expect(debugText).toBeInTheDocument();
  });

  it("supports entering letters from the on-screen keyboard", () => {
    render(<GameGrid />);

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "L" }));

    expect(screen.getByTestId("cell-0-0")).toHaveTextContent("A");
    expect(screen.getByTestId("cell-0-1")).toHaveTextContent("L");
  });

  it("supports reset, undo, and redo actions", () => {
    render(<GameGrid />);

    for (const key of ["A", "L", "E", "R", "T"]) {
      fireEvent.keyDown(window, { key });
    }
    fireEvent.keyDown(window, { key: "Enter" });

    expect(screen.getByTestId("cell-0-0")).toHaveTextContent("A");

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(screen.getByRole("button", { name: /redo/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /redo/i }));
    expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByTestId("cell-0-0")).toHaveTextContent("");
    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled();
  });

  it("filters possible words from grid constraints", () => {
    render(<GameGrid />);

    for (const key of ["A", "L", "E", "R", "T"]) {
      fireEvent.keyDown(window, { key });
    }

    // A is yellow at position 0
    fireEvent.click(screen.getByTestId("cell-0-0")); // → yellow

    // L is green at position 1
    fireEvent.click(screen.getByTestId("cell-0-1")); // → yellow
    fireEvent.click(screen.getByTestId("cell-0-1")); // → green

    // Before pressing enter, filtering doesn't apply to current row
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    // All words should still be visible since row 0 hasn't been submitted yet
    expect(screen.getByText(/alert.*bland.*clamp/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));

    // Now submit the row by pressing enter
    fireEvent.keyDown(window, { key: "Enter" });

    // After pressing enter, filtering applies
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    expect(screen.getByText(/bland, clamp/i)).toBeInTheDocument();
    expect(screen.queryByText(/alert, bland, clamp/i)).not.toBeInTheDocument();
  });

  it("auto-marks typed letters green when the column is already locked green", () => {
    render(<GameGrid />);

    // Row 0: lock L as green at column 1 and A as yellow at column 0.
    for (const key of ["A", "L", "E", "R", "T"]) {
      fireEvent.keyDown(window, { key });
    }
    fireEvent.click(screen.getByTestId("cell-0-0")); // A -> yellow
    fireEvent.click(screen.getByTestId("cell-0-1")); // L -> yellow
    fireEvent.click(screen.getByTestId("cell-0-1")); // L -> green
    fireEvent.keyDown(window, { key: "Enter" });

    // Row 1: type BLAND. The L at column 1 should auto-start as green.
    // Clicking once should therefore turn it back to default (not yellow).
    for (const key of ["B", "L", "A", "N", "D"]) {
      fireEvent.keyDown(window, { key });
    }
    fireEvent.click(screen.getByTestId("cell-1-1"));
    fireEvent.keyDown(window, { key: "Enter" });

    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    // If the cell had started default, one click would make it yellow and conflict
    // with the locked green, producing no candidates. We expect CLAMP to survive.
    expect(screen.getByText(/clamp/i)).toBeInTheDocument();
  });

  it("handles befit scenario with arose, lined, ethic, petit guesses", () => {
    render(<GameGrid />);

    // First row: AROSE
    for (const key of ["A", "R", "O", "S", "E"]) {
      fireEvent.keyDown(window, { key });
    }
    // E is yellow (in befit but at different position)
    fireEvent.click(screen.getByTestId("cell-0-4")); // → yellow
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    // After AROSE: should have befit and petit in candidates
    expect(screen.getByText(/befit.*petit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    
    // Submit row and move to next
    fireEvent.keyDown(window, { key: "Enter" });

    // Second row: LINED
    for (const key of ["L", "I", "N", "E", "D"]) {
      fireEvent.keyDown(window, { key });
    }
    // I is yellow at position 1 (in befit at position 3)
    fireEvent.click(screen.getByTestId("cell-1-1")); // → yellow
    // E is yellow at position 3 (in befit at position 1)
    fireEvent.click(screen.getByTestId("cell-1-3")); // → yellow
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    // After LINED: narrowed down further - befit should still be available
    expect(screen.getByText(/befit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    
    // Submit row and move to next
    fireEvent.keyDown(window, { key: "Enter" });

    // Third row: ETHIC - Check suggestions after just AROSE and LINED
    for (const key of ["E", "T", "H", "I", "C"]) {
      fireEvent.keyDown(window, { key });
    }
    // Before marking colors, suggestions should still be based on AROSE + LINED
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    // Should include petit and befit (and ethic, which matches AROSE + LINED constraints)
    expect(screen.getByText(/befit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    
    // Now mark the colors on ETHIC
    // E is yellow at position 0
    fireEvent.click(screen.getByTestId("cell-2-0")); // → yellow
    // T is yellow at position 1
    fireEvent.click(screen.getByTestId("cell-2-1")); // → yellow
    // I is green at position 3
    fireEvent.click(screen.getByTestId("cell-2-3")); // → yellow
    fireEvent.click(screen.getByTestId("cell-2-3")); // → green
    
    // Submit row and move to next
    fireEvent.keyDown(window, { key: "Enter" });

    // Fourth row: PETIT (final guess with strong constraints)
    for (const key of ["P", "E", "T", "I", "T"]) {
      fireEvent.keyDown(window, { key });
    }
    // Now suggestions should be filtered by all three guesses
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    // Should still have befit (but not petit which has P)
    expect(screen.getByText(/befit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));

    // Mark PETIT colors: P stays default (no constraint), E green at 1, T yellow at 2,
    // I auto-starts green at 3 (locked from prior row), T green at 4
    fireEvent.click(screen.getByTestId("cell-3-1")); // E → yellow
    fireEvent.click(screen.getByTestId("cell-3-1")); // E → green
    fireEvent.click(screen.getByTestId("cell-3-2")); // T → yellow
    fireEvent.click(screen.getByTestId("cell-3-4")); // T → yellow
    fireEvent.click(screen.getByTestId("cell-3-4")); // T → green

    // Submit PETIT
    fireEvent.keyDown(window, { key: "Enter" });

    // After submitting PETIT, befit should still be the top suggestion
    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    expect(screen.getByText(/befit/)).toBeInTheDocument();
  });

  it("befit survives when PETIT is submitted without marking any colors", () => {
    render(<GameGrid />);
    const enter = () => fireEvent.keyDown(window, { key: "Enter" });

    for (const key of ["A", "R", "O", "S", "E"]) fireEvent.keyDown(window, { key });
    fireEvent.click(screen.getByTestId("cell-0-4")); // E → yellow
    enter();

    for (const key of ["L", "I", "N", "E", "D"]) fireEvent.keyDown(window, { key });
    fireEvent.click(screen.getByTestId("cell-1-1")); // I → yellow
    fireEvent.click(screen.getByTestId("cell-1-3")); // E → yellow
    enter();

    for (const key of ["E", "T", "H", "I", "C"]) fireEvent.keyDown(window, { key });
    fireEvent.click(screen.getByTestId("cell-2-0")); // E → yellow
    fireEvent.click(screen.getByTestId("cell-2-1")); // T → yellow
    fireEvent.click(screen.getByTestId("cell-2-3")); fireEvent.click(screen.getByTestId("cell-2-3")); // I → green
    enter();

    // Submit PETIT with NO colors marked (all default — contributes no constraints)
    for (const key of ["P", "E", "T", "I", "T"]) fireEvent.keyDown(window, { key });
    enter();

    fireEvent.click(screen.getByRole("switch", { name: /debug: show all possible solutions/i }));
    // befit must still survive — default cells impose no constraints
    expect(screen.getByText(/befit/)).toBeInTheDocument();
  });
});
