import React, { useEffect, useMemo, useRef, useState } from "react";
import { 
  View, 
  Text, 
  Pressable, 
  useWindowDimensions, 
  ScrollView,
  TouchableOpacity,
  Linking 
} from "react-native";

/**
 * DET Vocabulary Practice - HomeScreen
 *
 * - Tap the chips you believe are REAL English words.
 * - "Check": grade your choices (TP / FP / FN / TN).
 * - "New set": randomize a new problem set.
 * - "Reset": clear selections for the current set.
 * - Optional 60s timer for exam-like pacing.
 *
 * Data source:
 * - Uses `popular-english-words` as the single vocabulary source.
 * - Difficulty tiers are defined by frequency rank.
 * - Pseudo-words are generated algorithmically from real words.
 * - No hard-coded emergency word lists are used.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type Difficulty = "easy" | "medium" | "hard" | "mixed";

type Item = {
  id: string;
  text: string;
  isReal: boolean;
  chosen: boolean;
};

type Score = {
  correct: number;
  total: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
};

/* -------------------------------------------------------------------------- */
/* Colors & Layout                                                             */
/* -------------------------------------------------------------------------- */

const COLORS = {
  bg: "#f5f5f7",
  bar: "#ffffff",
  border: "#d0d0dd",
  ink: "#111111",
  muted: "#666666",
  primary: "#2563eb",
  good: "#16a34a",
  bad: "#dc2626",
  warn: "#f97316",
};

const CONTENT_MAX_W = 720;

/* -------------------------------------------------------------------------- */
/* Wiring: popular-english-words                                              */
/* -------------------------------------------------------------------------- */

/**
 * We support several possible shapes of the `popular-english-words` export
 * so that Metro / Jest / bundlers do not break even if the package structure
 * changes slightly.
 *
 * Expected semantics:
 * - A long list of English words sorted by popularity (most frequent first).
 * - We only need "enough" words; upper bound is capped defensively.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const popularWordsModule: any = safeRequirePopularEnglishWords();

/**
 * Try to require the module safely.
 * If it is not available (e.g. local dev without npm install),
 * we return null and handle that gracefully in the UI.
 */
function safeRequirePopularEnglishWords(): unknown {
  try {
    // CommonJS require is friendlier to Metro / Jest in this setup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("popular-english-words");
  } catch {
    return null;
  }
}

/**
 * Extract a flat word list from the module in a robust way.
 *
 * Handles:
 * - direct array export
 * - { words: { getAll() / getMostPopular(n) } }
 * - { getAll() / getMostPopular(n) }
 * - or a `words` array.
 */
function getBaseWordListFromModule(limit = 50000): string[] {
  const mod = popularWordsModule;
  if (!mod) return [];

  // 1) Direct array export
  if (Array.isArray(mod)) {
    return mod
      .filter((w) => typeof w === "string")
      .slice(0, limit);
  }

  // 2) Nested `words` helper object
  if (mod.words) {
    const w = mod.words;

    if (typeof w.getAll === "function") {
      const all = w.getAll();
      if (Array.isArray(all)) {
        return all
          .filter((s: unknown) => typeof s === "string")
          .slice(0, limit);
      }
    }

    if (typeof w.getMostPopular === "function") {
      const top = w.getMostPopular(limit);
      if (Array.isArray(top)) {
        return top.filter((s: unknown) => typeof s === "string");
      }
    }

    if (Array.isArray(w)) {
      return w
        .filter((s: unknown) => typeof s === "string")
        .slice(0, limit);
    }
  }

  // 3) Top-level helpers
  if (typeof mod.getAll === "function") {
    const all = mod.getAll();
    if (Array.isArray(all)) {
      return all
        .filter((s: unknown) => typeof s === "string")
        .slice(0, limit);
    }
  }

  if (typeof mod.getMostPopular === "function") {
    const top = mod.getMostPopular(limit);
    if (Array.isArray(top)) {
      return top.filter((s: unknown) => typeof s === "string");
    }
  }

  return [];
}

/**
 * Canonical word list:
 * - based solely on `popular-english-words`.
 * - lowercased, alphabetic only, length >= 3.
 * - deduplicated.
 */
function getCanonicalWordList(): string[] {
  const base = getBaseWordListFromModule(50000);
  if (!base || base.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of base) {
    if (typeof raw !== "string") continue;
    const w = raw.trim().toLowerCase();

    if (w.length < 3) continue;
    if (!/^[a-z]+$/.test(w)) continue;
    if (!seen.has(w)) {
      seen.add(w);
      cleaned.push(w);
    }
  }

  return cleaned;
}

/* -------------------------------------------------------------------------- */
/* Difficulty model                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Difficulty over frequency rank (heuristic, DET-style):
 * - most frequent words → easier
 * - less frequent words → harder
 */
const DIFFICULTY_RANGES: Record<Difficulty, [number, number]> = {
  easy: [0, 2000],
  medium: [2000, 7000],
  hard: [7000, 15000],
  mixed: [0, 15000],
};

function getWordsForDifficulty(all: string[], difficulty: Difficulty): string[] {
  const [start, end] = DIFFICULTY_RANGES[difficulty] ?? DIFFICULTY_RANGES.mixed;
  const safeStart = Math.min(start, all.length);
  const safeEnd = Math.min(end, all.length);

  if (safeEnd > safeStart) {
    return all.slice(safeStart, safeEnd);
  }

  // If the requested slice is empty (e.g. short list), fall back to full list.
  return all;
}

/* -------------------------------------------------------------------------- */
/* Random helpers                                                              */
/* -------------------------------------------------------------------------- */

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function takeUniqueRandom<T>(pool: T[], count: number): T[] {
  if (count >= pool.length) {
    const copy = [...pool];
    shuffleInPlace(copy);
    return copy;
  }
  const taken = new Set<number>();
  const result: T[] = [];
  while (result.length < count && taken.size < pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!taken.has(idx)) {
      taken.add(idx);
      result.push(pool[idx]);
    }
  }
  return result;
}

/**
 * Generate a plausible pseudo-word by mutating a real word.
 * - Only a-z
 * - 1 mutation step (sub / ins / del)
 * - Not equal to original
 * - Not present in dictionary
 */
function makePseudoWord(
  base: string,
  dictionary: Set<string>,
  maxTries = 8
): string | null {
  const vowels = ["a", "e", "i", "o", "u"];
  const consonants = [
    "b",
    "c",
    "d",
    "f",
    "g",
    "h",
    "j",
    "k",
    "l",
    "m",
    "n",
    "p",
    "q",
    "r",
    "s",
    "t",
    "v",
    "w",
    "x",
    "y",
    "z",
  ];

  const clean = base.toLowerCase().replace(/[^a-z]/g, "");
  if (clean.length < 3) return null;

  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    let chars = clean.split("");
    const op = Math.floor(Math.random() * 3);

    if (op === 0) {
      // substitution
      const i = Math.floor(Math.random() * chars.length);
      const src = chars[i];
      const pool = /[aeiou]/.test(src) ? vowels : consonants;
      const replacement = pool[Math.floor(Math.random() * pool.length)];
      chars[i] = replacement;
    } else if (op === 1) {
      // insertion
      const i = Math.floor(Math.random() * (chars.length + 1));
      const pool = Math.random() < 0.4 ? vowels : consonants;
      const ch = pool[Math.floor(Math.random() * pool.length)];
      chars = [...chars.slice(0, i), ch, ...chars.slice(i)];
    } else {
      // deletion
      if (chars.length > 4) {
        const i = Math.floor(Math.random() * chars.length);
        chars.splice(i, 1);
      } else {
        // fallback to substitution for very short words
        const j = Math.floor(Math.random() * chars.length);
        const pool = vowels.concat(consonants);
        chars[j] = pool[Math.floor(Math.random() * pool.length)];
      }
    }

    const candidate = chars.join("");
    if (
      candidate.length >= 3 &&
      candidate !== clean &&
      !dictionary.has(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Problem set generation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Build a DET-style problem set:
 * - target size: size
 * - mix of real words and pseudo-words (best-effort)
 * - source: only `popular-english-words`
 */
function buildProblemSet(size: number, difficulty: Difficulty): Item[] {
  const allWords = getCanonicalWordList();
  if (allWords.length === 0) {
    // No vocabulary available -> no items.
    return [];
  }

  let pool = getWordsForDifficulty(allWords, difficulty);
  if (pool.length < 100) {
    // If slice is too small (e.g. very limited data), use all words to avoid bias.
    pool = allWords;
  }

  const dictionary = new Set(allWords);

  // We cannot safely create more unique pseudo-words than we have base words to mutate.
  const maxFeasibleSize = Math.min(size, pool.length * 2);
  const targetSize = Math.max(8, maxFeasibleSize);

  const targetReal = Math.max(4, Math.floor(targetSize / 2));
  const realWords = takeUniqueRandom(pool, targetReal);

  const pseudoWords: string[] = [];
  const used = new Set<string>(realWords);

  const pseudoSource = pool.length >= 200 ? pool : allWords;
  let safety = 0;

  while (
    pseudoWords.length + realWords.length < targetSize &&
    safety < targetSize * 40
  ) {
    safety += 1;
    const src =
      pseudoSource[Math.floor(Math.random() * pseudoSource.length)];
    const candidate = makePseudoWord(src, dictionary);
    if (!candidate) continue;
    if (used.has(candidate)) continue;
    used.add(candidate);
    pseudoWords.push(candidate);
  }

  // If we still do not reach targetSize, we accept a smaller set.
  const items: Item[] = [
    ...realWords.map((text, i) => ({
      id: `r-${i}-${text}`,
      text,
      isReal: true,
      chosen: false,
    })),
    ...pseudoWords.map((text, i) => ({
      id: `p-${i}-${text}`,
      text,
      isReal: false,
      chosen: false,
    })),
  ];

  shuffleInPlace(items);
  return items;
}

/* -------------------------------------------------------------------------- */
/* UI Components                                                               */
/* -------------------------------------------------------------------------- */

type ToolbarButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  label,
  onPress,
  disabled,
}) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    style={{
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: disabled ? COLORS.border : COLORS.primary,
      backgroundColor: disabled ? "#e5e7eb" : "#ffffff",
      opacity: disabled ? 0.6 : 1,
    }}
  >
    <Text
      style={{
        color: disabled ? COLORS.muted : COLORS.primary,
        fontSize: 12,
        fontWeight: "600",
      }}
    >
      {label}
    </Text>
  </Pressable>
);

/* -------------------------------------------------------------------------- */
/* Screen Component                                                            */
/* -------------------------------------------------------------------------- */

const HomeScreen: React.FC = () => {
  const { width } = useWindowDimensions();

  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [size, setSize] = useState<number>(24);
  const [items, setItems] = useState<Item[]>(() =>
    buildProblemSet(24, "mixed")
  );
  const [graded, setGraded] = useState<boolean>(false);
  const [score, setScore] = useState<Score>({
    correct: 0,
    total: 0,
    tp: 0,
    fp: 0,
    fn: 0,
    tn: 0,
  });

  const [timeLeft, setTimeLeft] = useState<number | null>(60);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /* ----- Timer logic ------------------------------------------------------- */

  useEffect(() => {
    if (timeLeft === null) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          // Auto-grade when time is up
          handleCheck(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, items]);

  const startStopTimer = () => {
    if (timeLeft === null) {
      setTimeLeft(60);
    } else {
      setTimeLeft(null);
    }
  };

  /* ----- Interaction handlers --------------------------------------------- */

  const toggleChoice = (id: string) => {
    if (graded) return;
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, chosen: !it.chosen } : it
      )
    );
  };

  const handleCheck = (fromTimer = false) => {
    setItems((prev) => {
      const current = prev;
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;

      for (const it of current) {
        if (it.chosen && it.isReal) tp += 1;
        else if (it.chosen && !it.isReal) fp += 1;
        else if (!it.chosen && it.isReal) fn += 1;
        else tn += 1;
      }

      const correct = tp + tn;
      const total = current.length;

      setScore({ correct, total, tp, fp, fn, tn });
      setGraded(true);

      if (!fromTimer && timeLeft !== null && timeLeft > 0) {
        setTimeLeft(null);
      }

      return current;
    });
  };

  const handleReset = () => {
    setItems((prev) => prev.map((it) => ({ ...it, chosen: false })));
    setGraded(false);
    setScore({
      correct: 0,
      total: items.length,
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0,
    });
    if (timeLeft !== null) setTimeLeft(60);
  };

  const handleNewSet = () => {
    const next = buildProblemSet(size, difficulty);
    setItems(next);
    setGraded(false);
    setScore({
      correct: 0,
      total: next.length,
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0,
    });
    if (timeLeft !== null) setTimeLeft(60);
  };

  const cycleDifficulty = () => {
    setDifficulty((prev) => {
      const order: Difficulty[] = ["easy", "medium", "hard", "mixed"];
      const idx = order.indexOf(prev);
      const next = order[(idx + 1) % order.length];
      const nextItems = buildProblemSet(size, next);
      setItems(nextItems);
      setGraded(false);
      setScore({
        correct: 0,
        total: nextItems.length,
        tp: 0,
        fp: 0,
        fn: 0,
        tn: 0,
      });
      if (timeLeft !== null) setTimeLeft(60);
      return next;
    });
  };

  /* ----- Layout helpers ---------------------------------------------------- */

  const columns = useMemo(() => {
    if (width >= 900) return 4;
    if (width >= 600) return 3;
    return 2;
  }, [width]);

  function chipStyle(it: Item) {
    let bg = "#fff";
    let border = COLORS.border;
    let ink = COLORS.ink;

    if (!graded) {
      bg = it.chosen ? COLORS.primary : "#fff";
      ink = it.chosen ? "#fff" : COLORS.ink;
      border = it.chosen ? COLORS.primary : COLORS.border;
    } else {
      if (it.chosen && it.isReal) {
        bg = COLORS.good; // TP
        ink = "#fff";
        border = COLORS.good;
      } else if (it.chosen && !it.isReal) {
        bg = COLORS.bad; // FP
        ink = "#fff";
        border = COLORS.bad;
      } else if (!it.chosen && it.isReal) {
        bg = COLORS.warn; // FN
        ink = "#111";
        border = COLORS.warn;
      } else {
        bg = "#fff"; // TN
        ink = COLORS.muted;
        border = COLORS.border;
      }
    }

    return { backgroundColor: bg, borderColor: border, color: ink };
  }

  const difficultyLabel =
    difficulty === "mixed"
      ? "Diff: Mixed"
      : `Diff: ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`;

  /* ----- Render ------------------------------------------------------------ */
  const noData = items.length === 0;
  const REPO_URL = "https://github.com/europanite/det_vocabulary";

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Top bar */}
      <View
        style={{
          backgroundColor: COLORS.bar,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: "100%",
            maxWidth: CONTENT_MAX_W,
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8,
          }}
        >
          <TouchableOpacity onPress={() => Linking.openURL(REPO_URL)}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                marginBottom: 12,
                color: "#1d4ed8",
                textDecorationLine: "underline",
              }}
            >
              DET Vocabulary Practice
            </Text>
          </TouchableOpacity>
          {/* Toolbar */}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <ToolbarButton
              label="Check"
              onPress={() => handleCheck(false)}
              disabled={graded && timeLeft !== null && timeLeft > 0}
            />
            <ToolbarButton label="Reset" onPress={handleReset} />
            <ToolbarButton label="New set" onPress={handleNewSet} />
            <ToolbarButton
              label={`Size: ${size}`}
              onPress={() => {
                const next = size === 24 ? 36 : size === 36 ? 48 : 24;
                setSize(next);
                const nextItems = buildProblemSet(next, difficulty);
                setItems(nextItems);
                setGraded(false);
                setScore({
                  correct: 0,
                  total: nextItems.length,
                  tp: 0,
                  fp: 0,
                  fn: 0,
                  tn: 0,
                });
                if (timeLeft !== null) setTimeLeft(60);
              }}
            />
            <ToolbarButton label={difficultyLabel} onPress={cycleDifficulty} />
            <ToolbarButton
              label={
                timeLeft === null
                  ? "Timer: Off"
                  : `Timer: ${timeLeft}s`
              }
              onPress={startStopTimer}
            />
          </View>

          {/* Score & hint */}
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {!noData && (
              <Text style={{ color: COLORS.ink }}>
                {graded
                  ? `Score: ${score.correct}/${score.total}`
                  : "Tap the words you believe are REAL English words."}
              </Text>
            )}
            {graded && !noData && (
              <Text style={{ color: COLORS.muted }}>
                TP {score.tp} • FP {score.fp} • FN {score.fn} • TN {score.tn}
              </Text>
            )}
            {noData && (
              <Text style={{ color: COLORS.bad }}>
                No vocabulary loaded. Please ensure
                {' `popular-english-words` '}is installed and accessible.
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Grid body */}
      <ScrollView contentContainerStyle={{ alignItems: "center" }}>
        <View
          style={{
            width: "100%",
            maxWidth: CONTENT_MAX_W,
            padding: 12,
          }}
        >
          {noData ? (
            <Text
              style={{
                color: COLORS.muted,
                textAlign: "center",
                marginTop: 24,
              }}
            >
              This service depends on the "popular-english-words" package.
              Install it in your project to generate DET-style word sets.
            </Text>
          ) : (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              {items.map((it) => {
                const style = chipStyle(it);
                const basis = `${100 / columns - 2}%` as `${number}%`; // ← 型を絞る

                return (
                  <Pressable
                    key={it.id}
                    onPress={() => toggleChoice(it.id)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: style.borderColor,
                      backgroundColor: style.backgroundColor,
                      minWidth: 0,
                      flexGrow: 1,
                      flexBasis: basis,
                    }}
                  >
                    <Text
                      style={{
                        color: style.color,
                        fontSize: 14,
                        textAlign: "center",
                        fontWeight: "500",
                      }}
                      numberOfLines={1}
                      ellipsizeMode="clip"
                    >
                      {it.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default HomeScreen;
