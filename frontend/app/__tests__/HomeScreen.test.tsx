import React from "react";
import {
  render,
  fireEvent,
  screen,
} from "@testing-library/react-native";
import HomeScreen from "../screens/HomeScreen";

jest.setTimeout(15000);

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

jest.mock("popular-english-words", () => ({
  // HomeScreen#getBaseWordListFromModule
  getAll: () => MOCK_VOCAB,
  words: {
    getAll: () => MOCK_VOCAB,
  },
}));

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
