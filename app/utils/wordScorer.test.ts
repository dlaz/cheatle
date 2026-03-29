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
});
