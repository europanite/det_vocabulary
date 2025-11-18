import React from "react";
import {
  render,
  fireEvent,
  screen,
} from "@testing-library/react-native";
import HomeScreen from "../screens/HomeScreen";

jest.setTimeout(15000);


// Common English derivational prefixes / suffixes for pseudo-morphology
const COMMON_PREFIXES = [
  "un", "re", "dis", "mis", "non",
  "over", "under", "pre", "post",
  "sub", "inter", "super", "semi",
  "anti", "counter", "co", "de",
];

const COMMON_SUFFIXES = [
  "ing", "ed", "er", "est",
  "ness", "less", "ful",
  "able", "ible",
  "ment", "tion", "sion",
  "al", "ous", "ish",
  "ism", "ist",
  "ize", "ise",
  "ly",
];

/**
 * Very small heuristic "morphological" splitter.
 * Tries to separate a known suffix and return STEM + SUFFIX.
 * This is *not* a real morphological analyzer, but good enough for pseudo-words.
 */
function guessStemAndSuffix(
  raw: string
): { stem: string; suffix: string | null } {
  const word = normalizeWord(raw);

  // longest suffix first to avoid cutting "tion" as "on"
  const sortedSuffixes = [...COMMON_SUFFIXES].sort(
    (a, b) => b.length - a.length
  );

  for (const suf of sortedSuffixes) {
    if (word.length - suf.length < 3) continue; // keep a minimum stem length
    if (word.endsWith(suf)) {
      return {
        stem: word.slice(0, word.length - suf.length),
        suffix: suf,
      };
    }
  }

  return { stem: word, suffix: null };
}

/**
 * Deterministic mock for `popular-english-words`.
 * HomeScreen expects a long-ish frequency-sorted word list.
 */
const MOCK_VOCAB = [
  "apple",
  "orange",
  "table",
  "chair",
  "window",
  "river",
  "music",
  "happy",
  "computer",
  "school",
  "language",
  "coffee",
  "planet",
  "library",
  "station",
  "mountain",
  "friend",
  "family",
];

jest.mock("subtlex-word-frequencies", () =>
  MOCK_VOCAB.map((w, index) => ({
    word: w,
    value: MOCK_VOCAB.length - index, // higher for more frequent
  }))
);

/**
 * Deterministic Math.random
 */
const randomSequence = Array.from({ length: 100 }, (_, i) => (i + 1) / 101);
let randomIndex = 0;

beforeEach(() => {
  randomIndex = 0;

  jest.spyOn(global.Math, "random").mockImplementation(() => {
    const value = randomSequence[randomIndex % randomSequence.length];
    randomIndex += 1;
    return value;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function getAnyRealChipText(): string | null {
  for (const w of MOCK_VOCAB) {
    if (screen.queryByText(w)) return w;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Basic behaviour                                                            */
/* -------------------------------------------------------------------------- */

describe("HomeScreen basic behaviour", () => {
  test("renders header, toolbar, hint text, and at least one vocabulary chip", () => {
    render(<HomeScreen />);

    expect(
      screen.getByText("DET Vocabulary Practice")
    ).toBeTruthy();

    expect(screen.getByText("Check")).toBeTruthy();
    expect(screen.getByText("Reset")).toBeTruthy();
    expect(screen.getByText("New set")).toBeTruthy();
    expect(screen.getByText(/Timer:/)).toBeTruthy();

    expect(
      screen.getByText("Select the real English words in this list")
    ).toBeTruthy();

    const anyReal = getAnyRealChipText();
    expect(anyReal).not.toBeNull();
  });

  test("Check grades the current selections and shows score", async () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Check"));

    // Score line should appear
    await screen.findByText(/Score: \d+\/\d+/);

    expect(screen.getByText(/Timer:/)).toBeTruthy();
  });

  test("Reset clears grading state and restores hint text", async () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Check"));
    await screen.findByText(/Score: \d+\/\d+/);

    fireEvent.press(screen.getByText("Reset"));

    expect(screen.queryByText(/Score: \d+\/\d+/)).toBeNull();
    expect(
      screen.getByText("Select the real English words in this list")
    ).toBeTruthy();
  });

  test("New set regenerates a problem set and resets scoring", async () => {
    render(<HomeScreen />);

    const before = getAnyRealChipText();
    expect(before).not.toBeNull();

    fireEvent.press(screen.getByText("New set"));

    expect(screen.queryByText(/Score: \d+\/\d+/)).toBeNull();
    expect(
      screen.getByText("Select the real English words in this list")
    ).toBeTruthy();

    const after = getAnyRealChipText();
    expect(after).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Timer behaviour (manual toggle only)                     */
/* -------------------------------------------------------------------------- */

describe("HomeScreen timer behaviour", () => {
  test("can toggle timer off and on via the Timer label", () => {
    render(<HomeScreen />);

    // Init
    const initial = screen.getByText(/Timer:/);
    expect(initial).toBeTruthy();

    // OFF
    fireEvent.press(initial);
    expect(screen.getByText("Timer: Off")).toBeTruthy();

    // ON
    const off = screen.getByText("Timer: Off");
    fireEvent.press(off);
    expect(screen.getByText(/Timer:/)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Robustness                                                                 */
/* -------------------------------------------------------------------------- */

describe("HomeScreen robustness", () => {
  test("after grading, chip presses do not ungrade or reset the score", async () => {
    render(<HomeScreen />);

    const chipText = getAnyRealChipText();
    expect(chipText).not.toBeNull();

    if (chipText) {
      fireEvent.press(screen.getByText(chipText));
    }
    fireEvent.press(screen.getByText("Check"));

    const scoreEl = await screen.findByText(/Score: \d+\/\d+/);

    if (chipText) {
      fireEvent.press(screen.getByText(chipText));
    }

    expect(scoreEl).toBeTruthy();
    expect(
      screen.queryByText("Select the real English words in this list")
    ).toBeNull();
  });
});
