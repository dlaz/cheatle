import {
  expectedRemainingAfterGuess,
  getFeedbackPattern,
  sortCandidates,
} from "./wordScorer";

describe("wordScorer elimination strategy", () => {
  it("computes Wordle feedback patterns with duplicate letters correctly", () => {
    expect(getFeedbackPattern("allee", "apple")).toBe("gyxxg");
    expect(getFeedbackPattern("apple", "allee")).toBe("gxxyg");
    expect(getFeedbackPattern("sassy", "assay")).toBe("yygxg");
  });

  it("computes expected remaining candidates from pattern buckets", () => {
    const solutions = ["allee", "apple", "ample"];

    expect(expectedRemainingAfterGuess("allee", solutions)).toBeCloseTo(5 / 3, 8);
    expect(expectedRemainingAfterGuess("apple", solutions)).toBeCloseTo(1, 8);
  });

  it("ranks guesses by minimizing expected remaining candidates", () => {
    const solutions = ["allee", "apple", "ample"];

    expect(sortCandidates(solutions)).toEqual(["ample", "apple", "allee"]);
  });

  it("prioritizes elimination when many candidates remain", () => {
    const candidates = [
      "minim",
      "freqy",
      ...Array.from({ length: 88 }, (_, i) => `word${i.toString().padStart(2, "0")}`),
    ];

    const precomputed: Record<string, number> = { minim: 1.0, freqy: 1.15 };
    const frequencies: Record<string, number> = { minim: 0.05, freqy: 1.0 };

    for (let i = 0; i < 88; i++) {
      const key = `word${i.toString().padStart(2, "0")}`;
      precomputed[key] = 1.22;
      frequencies[key] = 0.6;
    }

    expect(sortCandidates(candidates, precomputed, frequencies)[0]).toBe("minim");
  });

  it("prioritizes frequency when only a few candidates remain", () => {
    const candidates = ["minim", "freqy", "other"];
    const precomputed = {
      minim: 1.0,
      freqy: 1.08,
      other: 1.2,
    };
    const frequencies = {
      minim: 0.05,
      freqy: 1.0,
      other: 0.2,
    };

    expect(sortCandidates(candidates, precomputed, frequencies)).toEqual(["freqy", "minim", "other"]);
  });
});
