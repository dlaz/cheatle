"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  FormControlLabel,
  Paper,
  Switch,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import KeyboardHideIcon from "@mui/icons-material/KeyboardHide";
import wordsData from '../data/words.json';
import scoredWordsData from '../data/scored_words.json';
import wordByFrequencyData from '../data/word_by_frequency.json';
import OnScreenKeyboard from "./OnScreenKeyboard";
import { getFeedbackPattern, sortCandidates } from "../utils/wordScorer";

type ColorState = "default" | "grey" | "yellow" | "green";

interface CellData {
  letter: string;
  color: ColorState;
}

interface GameSnapshot {
  grid: CellData[][];
  currentRow: number;
  currentCol: number;
}

const GUESS_ROWS = 6;
const SUGGESTION_ROWS = 10;
const ROWS = GUESS_ROWS + SUGGESTION_ROWS;
const COLS = 5;

const createEmptyGrid = () =>
  Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ letter: "", color: "default" as ColorState }))
  );

const cloneGrid = (source: CellData[][]) =>
  source.map((row) => row.map((cell) => ({ ...cell })));

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const [showPossibleWords, setShowPossibleWords] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [hasInitializedKeyboard, setHasInitializedKeyboard] = useState(false);
  const [grid, setGrid] = useState<CellData[][]>(createEmptyGrid);
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);
  const [pastSnapshots, setPastSnapshots] = useState<GameSnapshot[]>([]);
  const [futureSnapshots, setFutureSnapshots] = useState<GameSnapshot[]>([]);

  // Async candidates sorted by the scorer worker (updated off the main thread).
  // Initialised synchronously using the precomputed O(n) scores so the first
  // render already has suggestions without waiting for a useEffect.
  const [candidates, setCandidates] = useState<string[]>(() => {
    const allWords = Array.isArray(wordsData) ? (wordsData as string[]) : [];
    return sortCandidates(
      allWords,
      scoredWordsData as Record<string, number>,
      wordByFrequencyData as Record<string, number>
    );
  });

  // Web Worker that runs sortCandidates() off the main thread.
  const workerRef = useRef<Worker | null>(null);
  // Monotonically increasing request id – incremented on every dispatch so
  // that stale worker responses (from superseded requests or after Reset/Undo)
  // are silently ignored.
  const requestIdRef = useRef(0);
  // Debounce timer for the O(n²) scoring path.
  const sortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hasInitializedKeyboard) return;

    // Default to showing the on-screen keyboard on mobile only.
    setShowKeyboard(isMobile);
    setHasInitializedKeyboard(true);
  }, [hasInitializedKeyboard, isMobile]);

  // Create the scorer worker once on mount and destroy it on unmount.
  // Guard against environments that don't support Worker (e.g. jsdom in Jest).
  useEffect(() => {
    if (typeof Worker === "undefined") {
      workerRef.current = null;
      return;
    }

    try {
      const worker = new Worker(
        new URL("../utils/scorer.worker.ts", import.meta.url),
        { type: "module" }
      );
      worker.onmessage = (e: MessageEvent<{ sorted: string[]; requestId: number }>) => {
        // Discard responses from superseded requests (e.g. rapid toggles,
        // Reset, or Undo/Redo that dispatched a later request while this one
        // was still in flight).
        if (e.data.requestId !== requestIdRef.current) return;
        setCandidates(e.data.sorted);
      };
      workerRef.current = worker;
      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      workerRef.current = null;
    }
  }, []);

  const getSnapshot = useCallback(
    (): GameSnapshot => ({
      grid: cloneGrid(grid),
      currentRow,
      currentCol,
    }),
    [grid, currentRow, currentCol]
  );

  const applySnapshot = useCallback((snapshot: GameSnapshot) => {
    setGrid(cloneGrid(snapshot.grid));
    setCurrentRow(snapshot.currentRow);
    setCurrentCol(snapshot.currentCol);
  }, []);

  const handleReset = useCallback(() => {
    setGrid(createEmptyGrid());
    setCurrentRow(0);
    setCurrentCol(0);
    setPastSnapshots([]);
    setFutureSnapshots([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (pastSnapshots.length === 0) return;

    const previous = pastSnapshots[pastSnapshots.length - 1];
    setPastSnapshots((prev) => prev.slice(0, -1));
    setFutureSnapshots((prev) => [getSnapshot(), ...prev]);
    applySnapshot(previous);
  }, [applySnapshot, getSnapshot, pastSnapshots]);

  const handleRedo = useCallback(() => {
    if (futureSnapshots.length === 0) return;

    const [next, ...rest] = futureSnapshots;
    setPastSnapshots((prev) => [...prev, getSnapshot()]);
    setFutureSnapshots(rest);
    applySnapshot(next);
  }, [applySnapshot, futureSnapshots, getSnapshot]);

  const handleGameKey = useCallback(
    (rawKey: string) => {
      const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;

      if (key === "Enter") {
        if (currentCol === COLS && currentRow < GUESS_ROWS - 1) {
          setPastSnapshots((prev) => [...prev, getSnapshot()]);
          setFutureSnapshots([]);
          setCurrentRow((prev) => prev + 1);
          setCurrentCol(0);
        }
        return;
      }

      if (key === "Backspace") {
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

      if (/^[A-Z]$/.test(key)) {
        if (currentCol < COLS && currentRow < ROWS) {
          setGrid((prev) => {
            const newGrid = [...prev];
            newGrid[currentRow] = [...newGrid[currentRow]];
            const typedLetter = key;
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
    },
    [currentCol, currentRow]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when user holds command/ctrl so they can refresh
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Let focused inputs handle their own key events to avoid double handling.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      handleGameKey(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGameKey]);

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

  const submittedRows = useMemo(() => grid.slice(0, currentRow), [grid, currentRow]);
  const solvedRowIndex = useMemo(
    () => submittedRows.findIndex((row) => row.every((cell) => cell.letter && cell.color === "green")),
    [submittedRows]
  );
  const shouldHideSuggestionsAfterSolve = useMemo(
    () =>
      grid
        .slice(0, GUESS_ROWS)
        .some((row) => row.every((cell) => Boolean(cell.letter) && cell.color === "green")),
    [grid]
  );

  // Cheap synchronous step: filter the word list using the submitted-row
  // constraints.  This runs on every relevant state change and is O(n·k)
  // where n = ~13 K words and k = 5 columns – fast enough to keep the
  // render path smooth.
  const { filtered, greens, possibleSolutions } = useMemo(() => {
    const greens: (string | null)[] = [null, null, null, null, null];
    const constraints: { guess: string; pattern: string }[] = [];

    // Only process submitted rows (rows before the current row)
    // This way, gray cells only filter after pressing enter
    for (let r = 0; r < submittedRows.length; r++) {
      let guess = "";
      let expectedPattern = "";
      let isComplete = true;

      for (let c = 0; c < COLS; c++) {
        const cell = submittedRows[r][c];
        if (!cell.letter) {
          isComplete = false;
          break;
        }
        const char = cell.letter.toLowerCase();
        guess += char;

        if (cell.color === "green") {
          greens[c] = char;
          expectedPattern += "g";
        } else if (cell.color === "yellow") {
          expectedPattern += "y";
        } else {
          expectedPattern += "x";
        }
      }

      if (isComplete && guess.length === COLS) {
        constraints.push({ guess, pattern: expectedPattern });
      }
    }

    const wordList = Array.isArray(wordsData) ? wordsData : [];

    const filtered = wordList.filter((word: string) => {
      if (!word || word.length !== COLS) return false;

      const w = word.toLowerCase();

      for (const { guess, pattern } of constraints) {
        if (getFeedbackPattern(guess, w) !== pattern) {
          return false;
        }
      }

      return true;
    });

    const possibleSolutions = [...filtered].sort();

    return { filtered, greens, possibleSolutions };
  }, [submittedRows]);

  // Expensive async step: rank the filtered candidates with the one-move
  // lookahead scorer.
  //
  // • When no rows have been submitted, the O(n) precomputed-scores path is
  //   fast enough to run synchronously on the main thread – no debounce needed.
  // • Once rows exist, each color-toggle triggers this effect. We debounce by
  //   150 ms so that rapid back-to-back clicks (e.g. marking a whole row)
  //   collapse into a single O(n²) scoring pass. That pass runs in the
  //   dedicated scorer Web Worker so the main thread is never blocked.
  useEffect(() => {
    if (sortTimerRef.current !== null) {
      clearTimeout(sortTimerRef.current);
      sortTimerRef.current = null;
    }

    if (submittedRows.length === 0) {
      // Initial state: precomputed O(n) lookup – fast, run immediately.
      const frequencyScores = wordByFrequencyData as Record<string, number>;
      const precomputedScores = scoredWordsData as Record<string, number>;
      setCandidates(sortCandidates(filtered, precomputedScores, frequencyScores));
      return;
    }

    // Subsequent states: debounce then dispatch to the worker.
    sortTimerRef.current = setTimeout(() => {
      sortTimerRef.current = null;
      if (workerRef.current) {
        // Increment only when we're actually sending to the worker so the
        // counter is never inflated by fallback/no-op paths.
        const requestId = ++requestIdRef.current;
        workerRef.current.postMessage({ candidates: filtered, requestId });
      } else {
        // Fallback for environments where Worker is unavailable.
        const frequencyScores = wordByFrequencyData as Record<string, number>;
        setCandidates(sortCandidates(filtered, undefined, frequencyScores));
      }
    }, 150);

    return () => {
      if (sortTimerRef.current !== null) {
        clearTimeout(sortTimerRef.current);
        sortTimerRef.current = null;
      }
    };
  }, [filtered, submittedRows.length]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        gap: 0,
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          p: 2,
          pb: 2,
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 560,
            display: "flex",
            justifyContent: "center",
            gap: 1,
            mb: 1,
            flexWrap: "wrap",
          }}
        >
          <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleReset}>
            Reset
          </Button>
          <Button
            variant="outlined"
            startIcon={<UndoIcon />}
            onClick={handleUndo}
            disabled={pastSnapshots.length === 0}
          >
            Undo
          </Button>
          <Button
            variant="outlined"
            startIcon={<RedoIcon />}
            onClick={handleRedo}
            disabled={futureSnapshots.length === 0}
          >
            Redo
          </Button>
          <Button
            variant="outlined"
            onClick={() => setShowKeyboard((prev) => !prev)}
            aria-pressed={showKeyboard}
            aria-label={showKeyboard ? "Hide keyboard" : "Show keyboard"}
            sx={{ minWidth: 0, px: 1 }}
          >
            {showKeyboard ? <KeyboardHideIcon /> : <KeyboardIcon />}
          </Button>
        </Box>

        {grid.map((row, rIdx) => {
        const isCandidateRow =
          !shouldHideSuggestionsAfterSolve &&
          rIdx > currentRow &&
          candidates.length > (rIdx - currentRow - 1);
        const candidateWord = isCandidateRow ? candidates[rIdx - currentRow - 1] : null;
        const isSolvedRow = solvedRowIndex >= 0 && rIdx === solvedRowIndex;

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
          <Box
            key={rIdx}
            data-testid={isSolvedRow ? `celebration-row-${rIdx}` : undefined}
            sx={{
              display: "flex",
              gap: 1,
              position: "relative",
              ...(isSolvedRow
                ? {
                    "&::after": {
                      content: '""',
                      position: "absolute",
                      inset: -8,
                      borderRadius: 2,
                      pointerEvents: "none",
                      boxShadow: "0 0 0 2px rgba(106,170,100,0.7)",
                      opacity: 0,
                      animation: "rowVictoryPulse 900ms ease-out 1 forwards",
                    },
                    "@keyframes rowVictoryPulse": {
                      "0%": { transform: "scale(0.98)", opacity: 0.35 },
                      "65%": { transform: "scale(1.03)", opacity: 0.8 },
                      "100%": { transform: "scale(1.05)", opacity: 0 },
                    },
                  }
                : {}),
            }}
          >
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
                  ...(isSolvedRow
                    ? {
                        boxShadow: "0 0 16px rgba(106,170,100,0.6)",
                        animation: "tileVictoryPop 500ms ease-out both",
                        animationDelay: `${cIdx * 45}ms`,
                        "@keyframes tileVictoryPop": {
                          "0%": { transform: "scale(1)" },
                          "45%": { transform: "scale(1.12)" },
                          "100%": { transform: "scale(1)" },
                        },
                      }
                    : {}),
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

      {showKeyboard && <OnScreenKeyboard onKeyPress={handleGameKey} />}
    </Box>
  );
}
