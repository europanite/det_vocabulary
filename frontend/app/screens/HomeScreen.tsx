import React, { useMemo, useRef, useState, useEffect } from "react";
import { 
  View, 
  Text, 
  Pressable, 
  useWindowDimensions, 
  ScrollView, 
  TouchableOpacity,
  Linking, 
} from "react-native";

/**
 * DET Vocabulary Practice - HomeScreen
 * - Tap words you think are REAL English words.
 * - "Check" to grade; "New set" to reshuffle; "Reset" to clear selections.
 * - 60s timer (optional) for test-like pacing.
 */

/* ---------- Word Bank ---------------------------------------------------- */
/** Mark real English words (isReal: true) and plausible non-words (false). */
const WORD_BANK: { text: string; isReal: boolean }[] = [
  // From the reference mock and common DET-style items (screenshot inspired)
  // Real
  { text: "layer", isReal: true },
  { text: "calmly", isReal: true },
  { text: "phase", isReal: true },
  { text: "wipe", isReal: true },
  { text: "educational", isReal: true },
  { text: "faint", isReal: true },
  { text: "evidently", isReal: true },
  { text: "investigation", isReal: true },
  { text: "candidate", isReal: true },
  { text: "functional", isReal: true },
  { text: "overtake", isReal: true },
  { text: "string", isReal: true },
  { text: "thrive", isReal: true },
  { text: "assumption", isReal: true },
  { text: "authentic", isReal: true },
  { text: "appliance", isReal: true },
  { text: "violate", isReal: true },
  { text: "grumpy", isReal: true },
  { text: "misinform", isReal: true },
  { text: "advice", isReal: true },
  { text: "grandfather", isReal: true },
  { text: "post", isReal: true },
  { text: "brick", isReal: true },
  { text: "skate", isReal: true },
  { text: "believe", isReal: true },
  { text: "invitation", isReal: true },
  { text: "question", isReal: true },

  // Non-words (plausible-looking)
  { text: "bease", isReal: false },
  { text: "couright", isReal: false },
  { text: "jeap", isReal: false },
  { text: "breathly", isReal: false },
  { text: "rivition", isReal: false },
  { text: "outspect", isReal: false },
  { text: "leuts", isReal: false },
  { text: "tumpine", isReal: false },
  { text: "compolity", isReal: false },
  { text: "scramaging", isReal: false },
  { text: "fanary", isReal: false },
  { text: "converty", isReal: false },
  { text: "troughtle", isReal: false },
  { text: "redictor", isReal: false },
  { text: "loadine", isReal: false },
  { text: "trovern", isReal: false },
  { text: "spacking", isReal: false },
  { text: "damber", isReal: false },
  { text: "soxy", isReal: false },
  { text: "busill", isReal: false },
  { text: "groose", isReal: false },
  { text: "lomes", isReal: false },
  { text: "knoce", isReal: false },
  { text: "baten", isReal: false },
  { text: "smeding", isReal: false },
  { text: "hosking", isReal: false },
  { text: "suitad", isReal: false },
];

/* ---------- Helpers ------------------------------------------------------ */
type Item = { id: number; text: string; isReal: boolean; chosen: boolean };

function shuffle<T>(arr: T[], rnd: () => number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seededRandom(seed: number) {
  // Simple LCG for reproducible shuffles in a single session
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* Pick a balanced set with approx 50/50 real vs fake */
function pickProblemSet(count: number, seed = Date.now()): Item[] {
  const rnd = seededRandom(seed);
  const real = WORD_BANK.filter(w => w.isReal);
  const fake = WORD_BANK.filter(w => !w.isReal);
  const half = Math.max(1, Math.floor(count / 2));
  const chosen = shuffle(real, rnd).slice(0, half).concat(shuffle(fake, rnd).slice(0, count - half));
  return shuffle(chosen, rnd).map((w, i) => ({ id: i + 1, text: w.text, isReal: w.isReal, chosen: false }));
}

/* ---------- Styling ------------------------------------------------------ */
const COLORS = {
  bg: "#ffffff",
  ink: "#111827",
  bar: "#f3f4f6",
  primary: "#ff8a00",
  border: "#e5e7eb",
  good: "#22c55e",
  bad: "#ef4444",
  warn: "#f59e0b",
  muted: "#9ca3af",
};
const CONTENT_MAX_W = 980;

/* ---------- Component ---------------------------------------------------- */
export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const [seed, setSeed] = useState<number>(() => Date.now());
  const [size, setSize] = useState<24 | 36>(24);
  const [items, setItems] = useState<Item[]>(() => pickProblemSet(24, seed));
  const [graded, setGraded] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(60);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Responsive columns
  const columns = width < 480 ? 2 : width < 720 ? 3 : width < 1024 ? 4 : 5;

  // Score
  const score = useMemo(() => {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const it of items) {
      if (it.chosen && it.isReal) tp++;
      else if (it.chosen && !it.isReal) fp++;
      else if (!it.chosen && it.isReal) fn++;
      else tn++;
    }
    return { tp, fp, fn, tn, total: items.length, correct: tp + tn };
  }, [items]);

  // Timer effect
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      setGraded(true);
      return;
    }
    timerRef.current && clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTimeLeft((t) => (t === null ? null : t - 1)), 1000);
    return () => {
      timerRef.current && clearTimeout(timerRef.current);
    };
  }, [timeLeft]);

  function toggleChoice(id: number) {
    if (graded) return;
    setItems(prev => prev.map(it => (it.id === id ? { ...it, chosen: !it.chosen } : it)));
  }

  function onCheck() {
    setGraded(true);
  }

  function onReset() {
    setItems(prev => prev.map(it => ({ ...it, chosen: false })));
    setGraded(false);
    setTimeLeft(60);
  }

  function onNewSet() {
    const newSeed = Date.now();
    setSeed(newSeed);
    setItems(pickProblemSet(size, newSeed));
    setGraded(false);
    setTimeLeft(60);
  }

  function startStopTimer() {
    // null => running disabled; number => counting
    if (timeLeft === null) setTimeLeft(60);
    else setTimeLeft(null);
  }

  /* Determine chip color after grading */
  function chipStyle(it: Item) {
    let bg = "#fff";
    let border = COLORS.border;
    let ink = COLORS.ink;

    if (!graded) {
      bg = it.chosen ? COLORS.primary : "#fff";
      ink = it.chosen ? "#fff" : COLORS.ink;
      border = it.chosen ? COLORS.primary : COLORS.border;
    } else {
      if (it.chosen && it.isReal) { bg = COLORS.good; ink = "#fff"; border = COLORS.good; }      // TP
      else if (it.chosen && !it.isReal) { bg = COLORS.bad; ink = "#fff"; border = COLORS.bad; }  // FP
      else if (!it.chosen && it.isReal) { bg = COLORS.warn; ink = "#111"; border = COLORS.warn; } // FN
      else { bg = "#fff"; ink = COLORS.muted; border = COLORS.border; }                          // TN
    }
    return { backgroundColor: bg, borderColor: border, color: ink };
  }

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

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <ToolbarButton label="Check" onPress={onCheck} disabled={graded === true && timeLeft !== null && timeLeft > 0} />
            <ToolbarButton label="Reset" onPress={onReset} />
            <ToolbarButton label="New set" onPress={onNewSet} />
            <ToolbarButton
              label={`Size: ${size}`}
              onPress={() => {
                const next = size === 24 ? 36 : 24;
                setSize(next);
                setItems(pickProblemSet(next, seed));
                setGraded(false);
                setTimeLeft(60);
              }}
            />
            <ToolbarButton label={timeLeft === null ? "Timer: Off" : `Timer: ${timeLeft}s`} onPress={startStopTimer} />
          </View>

          {/* Score & hints */}
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Text style={{ color: COLORS.ink }}>
              {graded ? `Score: ${score.correct}/${score.total}` : "Tap words you believe are REAL."}
            </Text>
            {graded && (
              <Text style={{ color: COLORS.muted }}>
                TP {score.tp} • FP {score.fp} • FN {score.fn} • TN {score.tn}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Body */}
      <ScrollView contentContainerStyle={{ alignItems: "center" }}>
        <View style={{ width: "100%", maxWidth: CONTENT_MAX_W, padding: 12 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {items.map((it) => (
              <Pressable
                key={it.id}
                onPress={() => toggleChoice(it.id)}
                style={{
                  borderWidth: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  minWidth: `${100 / columns - 2}%`,
                  alignItems: "center",
                  ...(chipStyle(it) as any),
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: (chipStyle(it) as any).color }}>
                  {it.text}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Legend */}
          {graded && (
            <View style={{ marginTop: 18, gap: 8 }}>
              <Text style={{ color: COLORS.muted }}>Legend</Text>
              <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                <Legend color={COLORS.good} label="Correct: Selected REAL (TP)" />
                <Legend color={COLORS.bad} label="Incorrect: Selected NON-word (FP)" />
                <Legend color={COLORS.warn} label="Missed REAL (FN)" />
                <Legend color={COLORS.border} label="Correct: Ignored NON-word (TN)" />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- Small UI bits ------------------------------------------------ */
function ToolbarButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        backgroundColor: disabled ? "#e5e7eb" : COLORS.primary,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: COLORS.ink }}>{label}</Text>
    </View>
  );
}
