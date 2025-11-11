const words = [
  "apple",
  "river",
  "novel",
  "planet",
  "school",
  "friend",
  "music",
  "window",
  "garden",
  "orange",
  "pencil",
  "family",
  "station",
  "coffee",
  "mountain",
  "yellow",
  "bridge",
  "holiday",
];

module.exports = {
  // Case 1: direct array export
  words,

  // Case 2/3: helper-style APIs that HomeScreen getBaseWordListFromModule
  getAll: () => words.slice(),
  getMostPopular: (n) => words.slice(0, n),

  english: {
    getMostPopularWords: (opts) =>
      words.slice(0, (opts && opts.number) || words.length),
  },
};
