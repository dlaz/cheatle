"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Box, FormControlLabel, Paper, Switch, Typography } from "@mui/material";
import wordsData from '../data/words.json';
import { byFrequency } from "../utils/sorters";
import { sortCandidates } from "../utils/wordScorer";

type ColorState = "default" | "grey" | "yellow" | "green";

interface CellData {
  letter: string;
  color: ColorState;
}

const GUESS_ROWS = 6;
const SUGGESTION_ROWS = 10;
const ROWS = GUESS_ROWS + SUGGESTION_ROWS;
const COLS = 5;

const getColorCode = (color: ColorState) => {
  switch (color) {
    case "grey":
      return "#787c7e"; // Wordle grey
    case "yellow":
      return "#c9b458"; // Wordle yellow
    case "green":
      return "#6aaa64"; // Wordle green
    default:
      return "transparent";
  }
};

const getTextColor = (color: ColorState) => {
  // Always keep text black if not colored, white if colored
  return color === "default" ? "#fff" : "#fff";
};

const getBorderColor = (color: ColorState, letter: string) => {
  if (color !== "default") return getColorCode(color);
  return letter ? "#878a8c" : "#d3d6da";
};

export default function GameGrid() {
  const [showPossibleWords, setShowPossibleWords] = useState(false);
  const [grid, setGrid] = useState<CellData[][]>(
    Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => ({ letter: "", color: "default" }))
    )
  );
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when user holds command/ctrl so they can refresh
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        if (currentCol === COLS && currentRow < GUESS_ROWS - 1) {
          setCurrentRow((prev) => prev + 1);
          setCurrentCol(0);
        }
        return;
      }

      if (e.key === "Backspace") {
        if (currentCol > 0) {
          setGrid((prev) => {
            const newGrid = [...prev];
            newGrid[currentRow] = [...newGrid[currentRow]];
            newGrid[currentRow][currentCol - 1] = { letter: "", color: "default" };
            return newGrid;
          });
          setCurrentCol((prev) => prev - 1);
        }
        return;
      }

      if (/^[a-zA-Z]$/.test(e.key)) {
        if (currentCol < COLS && currentRow < ROWS) {
          setGrid((prev) => {
            const newGrid = [...prev];
            newGrid[currentRow] = [...newGrid[currentRow]];
            const typedLetter = e.key.toUpperCase();
            let autoColor: ColorState = "default";

            // If this column is already green in prior submitted rows, auto-mark
            // the same letter as green while typing to reduce repetitive clicks.
            for (let r = 0; r < currentRow; r++) {
              const lockedCell = prev[r][currentCol];
              if (lockedCell.color === "green" && lockedCell.letter === typedLetter) {
                autoColor = "green";
                break;
              }
            }

            newGrid[currentRow][currentCol] = {
              letter: typedLetter,
              color: autoColor,
            };
            return newGrid;
          });
          setCurrentCol((prev) => prev + 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentRow, currentCol]);

  const toggleColor = (r: number, c: number) => {
    // Only allow toggling color if there's a letter
    if (!grid[r][c].letter) return;

    setGrid((prev) => {
      const newGrid = [...prev];
      newGrid[r] = [...newGrid[r]];

      const currentColor = newGrid[r][c].color;
      let nextColor: ColorState = "default";

      if (currentColor === "default") nextColor = "yellow";
      else if (currentColor === "yellow") nextColor = "green";
      else if (currentColor === "green") nextColor = "default";

      newGrid[r][c] = { ...newGrid[r][c], color: nextColor };
      return newGrid;
    });
  };

  const { candidates, greens, possibleSolutions } = useMemo(() => {
    const greens: (string | null)[] = [null, null, null, null, null];
    const yellows: { char: string; pos: number }[] = [];
    const greys: { char: string; pos: number }[] = [];

    // Only process submitted rows (rows before the current row)
    // This way, gray cells only filter after pressing enter
    for (let r = 0; r < currentRow; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (!cell.letter) continue;

        const char = cell.letter.toLowerCase();
        if (cell.color === "green") {
          greens[c] = char;
        } else if (cell.color === "yellow") {
          yellows.push({ char, pos: c });
        } else if (cell.color === "default" || cell.color === "grey") {
          greys.push({ char, pos: c });
        }
      }
    }

    const wordList = Array.isArray(wordsData) ? wordsData : [];

    const filtered = wordList.filter((word: string) => {
      if (!word || word.length !== COLS) return false;

      const w = word.toLowerCase();

      // Check greens
      for (let i = 0; i < COLS; i++) {
        if (greens[i] !== null && w[i] !== greens[i]) {
          return false;
        }
      }

      // Check yellows
      for (const y of yellows) {
        if (w[y.pos] === y.char) return false;

        let foundValidPosition = false;
        for (let j = 0; j < COLS; j++) {
          if (w[j] === y.char && j !== y.pos) {
            foundValidPosition = true;
            break;
          }
        }
        if (!foundValidPosition) return false;
      }

      // Check greys
      for (const g of greys) {
        const isAlsoGreenOrYellow = greens.includes(g.char) || yellows.some(y => y.char === g.char);

        if (!isAlsoGreenOrYellow) {
          if (w.includes(g.char)) return false;
        } else {
          let allowedCount = 0;
          for (let i = 0; i < COLS; i++) {
            if (greens[i] === g.char) allowedCount++;
          }
          allowedCount += yellows.filter(y => y.char === g.char).length;

          const occurrencesInW = w.split('').filter(c => c === g.char).length;
          if (occurrencesInW > allowedCount) return false;
        }
      }

      return true;
    });

    // Rank suggestions using shared heuristics first, then positional scoring.
    const candidates = sortCandidates(byFrequency(filtered));
    const possibleSolutions = [...filtered].sort();

    return { candidates, greens, possibleSolutions };
  }, [grid, currentRow]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        p: 2,
      }}
    >
      {grid.map((row, rIdx) => {
        const isCandidateRow = rIdx > currentRow && candidates.length > (rIdx - currentRow - 1);
        const candidateWord = isCandidateRow ? candidates[rIdx - currentRow - 1] : null;

        if (candidateWord) {
          return (
            <Box key={rIdx} sx={{ display: "flex", gap: 1 }}>
              {candidateWord.split("").map((char: string, cIdx: number) => {
                const isGreen = greens[cIdx] === char.toLowerCase();
                return (
                  <Paper
                    key={cIdx}
                    elevation={0}
                    onClick={() => {
                       setGrid(prev => {
                          const newGrid = [...prev];
                          newGrid[currentRow] = candidateWord.split("").map((c, i) => ({
                             letter: c.toUpperCase(),
                             color: greens[i] === c.toLowerCase() ? "green" : "default"
                          }));
                          return newGrid;
                       });
                       setCurrentCol(COLS);
                    }}
                    sx={{
                      width: 62,
                      height: 62,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      backgroundColor: isGreen ? "rgba(106, 170, 100, 0.2)" : "transparent",
                      border: `2px dashed ${isGreen ? "#6aaa64" : "#565758"}`,
                      color: isGreen ? "#fff" : "#878a8c",
                      fontWeight: "bold",
                      fontSize: "2rem",
                      transition: "all 0.2s ease",
                      userSelect: "none",
                    }}
                  >
                    {char.toUpperCase()}
                  </Paper>
                );
              })}
            </Box>
          );
        }

        return (
          <Box key={rIdx} sx={{ display: "flex", gap: 1 }}>
            {row.map((cell, cIdx) => (
              <Paper
                key={cIdx}
                data-testid={`cell-${rIdx}-${cIdx}`}
                elevation={0}
                onClick={() => toggleColor(rIdx, cIdx)}
                sx={{
                  width: 62,
                  height: 62,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: cell.letter ? "pointer" : "default",
                  backgroundColor: getColorCode(cell.color),
                  border: `2px solid ${getBorderColor(cell.color, cell.letter)}`,
                  color: getTextColor(cell.color),
                  fontWeight: "bold",
                  fontSize: "2rem",
                  transition: "all 0.2s ease",
                  userSelect: "none",
                }}
              >
                {cell.letter}
              </Paper>
            ))}
          </Box>
        );
      })}
      <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary', textAlign: 'center' }}>
        Type to enter letters. Click on a letter to cycle through colors (Grey, Yellow, Green). Press Enter to submit row.
      </Typography>

      <Box sx={{ width: "100%", maxWidth: 720, mt: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={showPossibleWords}
              onChange={(e) => setShowPossibleWords(e.target.checked)}
              size="small"
            />
          }
          label={`Debug: show all possible solutions (${possibleSolutions.length})`}
          sx={{ color: "text.secondary" }}
        />

        {showPossibleWords && (
          <Box
            sx={{
              mt: 1,
              p: 1.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              maxHeight: 220,
              overflowY: "auto",
              backgroundColor: "rgba(255,255,255,0.03)",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              lineHeight: 1.5,
              color: "text.secondary",
            }}
          >
            {possibleSolutions.join(", ") || "No possible solutions with current constraints."}
          </Box>
        )}
      </Box>


    </Box>
  );
}
