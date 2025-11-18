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

// --- Wiring: subtlex-word-frequencies (lazy + defensive) -------------

const WORD_LIST_LIMIT = 50000;

// Lazily require the module so Jest mocks are applied *before* we load it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadWordListModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("subtlex-word-frequencies");
  } catch (_err) {
    return null;
  }
}

/**
 * Normalize a raw word into a canonical lowercase form.
 * You should already have this function below in your file;
 * if not, keep this implementation.
 */
function normalizeWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    // strip simple punctuation at the edges
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

/**
 * Filter out weird candidates:
 * - too short
 * - contains digits
 * - contains spaces or obvious punctuation
 */
function isGoodCandidateWord(w: string): boolean {
  if (!w) return false;
  if (w.length < 3) return false;
  if (!/^[a-z]+$/.test(w)) return false;
  return true;
}

/**
 * Convert whatever the module exports into a simple string[].
 * Supports:
 *   - string[]
 *   - { word: string }[]
 *   - { words: string[] }
 *   - { words: { getAll(): string[] } }
 *   - { getAll(): string[] }
 *   - { getMostPopular(n): string[] }
 */
function getBaseWordListFromModule(limit: number = WORD_LIST_LIMIT): string[] {
  const raw = loadWordListModule();
  if (!raw) {
    return [];
  }

  // Handle both CJS and ESM default exports
  const mod: any = (raw as any).default ?? raw;

  // 1) Direct array export – either string[] or { word: string; ... }[]
  if (Array.isArray(mod)) {
    if (mod.length === 0) return [];

    const first = mod[0];

    // Case: string[]
    if (typeof first === "string") {
      return (mod as unknown[])
        .filter((w): w is string => typeof w === "string")
        .slice(0, limit);
    }

    // Case: array of objects with `.word`
    if (first && typeof first === "object" && "word" in first) {
      return (mod as any[])
        .map((entry) =>
          entry && typeof entry.word === "string" ? entry.word : null
        )
        .filter((w: string | null): w is string => !!w)
        .slice(0, limit);
    }
  }

  // 2) Objects like { words: string[] } or { words: { getAll(): string[] } }
  if (mod && typeof mod === "object" && "words" in mod) {
    const wordsSection = (mod as any).words;

    if (Array.isArray(wordsSection)) {
      return wordsSection
        .filter((w: unknown): w is string => typeof w === "string")
        .slice(0, limit);
    }

    if (wordsSection && typeof wordsSection.getAll === "function") {
      const all = wordsSection.getAll();
      if (Array.isArray(all)) {
        return all
          .filter((w: unknown): w is string => typeof w === "string")
          .slice(0, limit);
      }
    }

    if (wordsSection && typeof wordsSection.getMostPopular === "function") {
      const popular = wordsSection.getMostPopular(limit);
      if (Array.isArray(popular)) {
        return popular
          .filter((w: unknown): w is string => typeof w === "string")
          .slice(0, limit);
      }
    }
  }

  // 3) Objects like { getAll(): string[] } / { getMostPopular(n): string[] }
  if (mod && typeof mod === "object") {
    if (typeof (mod as any).getAll === "function") {
      const all = (mod as any).getAll();
      if (Array.isArray(all)) {
        return all
          .filter((w: unknown): w is string => typeof w === "string")
          .slice(0, limit);
      }
    }

    if (typeof (mod as any).getMostPopular === "function") {
      const popular = (mod as any).getMostPopular(limit);
      if (Array.isArray(popular)) {
        return popular
          .filter((w: unknown): w is string => typeof w === "string")
          .slice(0, limit);
      }
    }
  }

  return [];
}

let cachedCanonicalWordList: string[] | null = null;

function getCanonicalWordList(): string[] {
  if (cachedCanonicalWordList) {
    return cachedCanonicalWordList;
  }

  const baseList = getBaseWordListFromModule();

  const cleaned = baseList
    .map((w) => normalizeWord(w))
    .filter((w) => isGoodCandidateWord(w));

  cachedCanonicalWordList = Array.from(new Set(cleaned));

  return cachedCanonicalWordList;
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

/**
 * Generate a plausible pseudo-word by mutating a single real word.
 * - Only a-z
 * - 1 mutation step (sub / ins / del)
 * - Not equal to original
 * - Not present in dictionary
 */
function makeMutatedPseudoWord(
  base: string,
  dictionary: Set<string>,
  maxTries = 8
): string | null {
  const vowels = ["a", "e", "i", "o", "u"];
  const consonants = [
    "b","c","d","f","g","h","j","k","l","m",
    "n","p","q","r","s","t","v","w","x","y","z",
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

/**
 * Generate a DET-style pseudo-word by blending two real words.
 * Example: "some" + "other" -> "somether"-like strings.
 *
 * Strategy:
 * - Pick two different real words from the pool.
 * - Take a prefix of the first and a suffix of the second.
 * - Concatenate them.
 * - Reject if the result is a real word or too similar/short.
 */
function makeBlendedPseudoWordFromPool(
  pool: string[],
  dictionary: Set<string>,
  maxTries = 16
): string | null {
  if (pool.length < 2) return null;

  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    const w1 = pool[Math.floor(Math.random() * pool.length)];
    const w2 = pool[Math.floor(Math.random() * pool.length)];
    if (!w1 || !w2 || w1 === w2) continue;

    const a = normalizeWord(w1);
    const b = normalizeWord(w2);
    if (!isGoodCandidateWord(a) || !isGoodCandidateWord(b)) continue;

    // Choose cut positions
    // prefix length of first word
    const minPrefix = Math.min(2, a.length - 1);
    const maxPrefix = Math.max(minPrefix, Math.min(a.length - 1, 4));
    const prefixLen =
      minPrefix + Math.floor(Math.random() * (maxPrefix - minPrefix + 1));

    // suffix start index of second word
    const minSuffixStart = 1;
    const maxSuffixStart = Math.max(
      minSuffixStart,
      Math.min(b.length - 2, 4)
    );
    const suffixStart =
      minSuffixStart +
      Math.floor(Math.random() * (maxSuffixStart - minSuffixStart + 1));

    const prefix = a.slice(0, prefixLen);
    const suffix = b.slice(suffixStart);
    const candidate = (prefix + suffix).toLowerCase();

    // Basic filters
    if (candidate.length < 4) continue;
    if (candidate === a || candidate === b) continue;
    if (!/[aeiou]/.test(candidate)) continue; // must contain a vowel
    if (!/^[a-z]+$/.test(candidate)) continue;
    if (dictionary.has(candidate)) continue;

    return candidate;
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

    let candidate: string | null = null;

    // Prefer DET-like blends most of the time,
    // but occasionally fall back to single-word mutation
    if (Math.random() < 0.7) {
      candidate = makeBlendedPseudoWordFromPool(pseudoSource, dictionary);
    } else {
      const src =
        pseudoSource[Math.floor(Math.random() * pseudoSource.length)];
      candidate = makeMutatedPseudoWord(src, dictionary);
    }

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
type ToolbarVariant = "primary" | "neutral" | "success" | "danger" | "warn" | "info";

type ToolbarButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ToolbarVariant;
};

function getToolbarColors(variant: ToolbarVariant, disabled?: boolean) {
  if (disabled) {
    return {
      bg: "#e5e7eb",
      border: COLORS.border,
      text: COLORS.muted,
    };
  }

  switch (variant) {
    case "primary":
      return {
        bg: COLORS.primary,
        border: "#dddadaff",
        text: "#ffffff",
      };
    case "success":
      return {
        bg: COLORS.good,
        border: "#dddadaff",
        text: "#ffffff",
      };
    case "danger":
      return {
        bg: COLORS.bad,
        border: "#dddadaff",
        text: "#ffffff",
      };
    case "warn":
      return {
        bg: COLORS.warn,
        border: "#dddadaff",
        text: "#ffffff",
      };
    case "info":
      return {
        bg: "#38bdf8",
        border: "#dddadaff",
        text: "#0f172a",
      };
    case "neutral":
    default:
      return {
        bg: "#f3f4f6",
        border: COLORS.border,
        text: COLORS.ink,
      };
  }
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  label,
  onPress,
  disabled,
  variant = "primary",
}) => {
  const palette = getToolbarColors(variant, disabled);

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        opacity: disabled ? 0.5 : 1,
        minWidth: 86,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: palette.text,
          fontSize: 13,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
};


/* -------------------------------------------------------------------------- */
/* Screen Component                                                            */
/* -------------------------------------------------------------------------- */

const HomeScreen: React.FC = () => {
  const { width } = useWindowDimensions();

  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [size, setSize] = useState<number>(18);
  const [items, setItems] = useState<Item[]>(() =>
    buildProblemSet(18, "mixed")
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
    if (width >= 900) return 6;
    if (width >= 600) return 4;
    return 3;
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
              variant="primary"
            />
            <ToolbarButton
              label="Reset"
              onPress={handleReset}
              variant="neutral"
            />
            <ToolbarButton
              label="New set"
              onPress={handleNewSet}
              variant="success"
            />
            <ToolbarButton
              label={timeLeft === null ? "Timer: Off" : `Timer: ${timeLeft}s`}
              onPress={startStopTimer}
              variant="warn"
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
                  : "Select the real English words in this list"}
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

                // columns :6 / Tablets:4 / Phones:3）
                const chipWidth = `${100 / columns - 2}%` as `${number}%`;

                return (
                  <Pressable
                    key={it.id}
                    onPress={() => toggleChoice(it.id)}
                    style={{
                      width: chipWidth,
                      paddingVertical: 8,
                      paddingHorizontal: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: style.borderColor,
                      backgroundColor: style.backgroundColor,
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 32,
                    }}
                  >
                    <Text
                      style={{
                        color: style.color,
                        fontSize: 12,
                        textAlign: "center",
                        flexShrink: 1,
                        flexWrap: "wrap",
                      }}
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
