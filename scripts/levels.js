const LEVEL_COUNT = 1000;
const ROWS = 5;
const COLS = 4;

function makeRoute(levelIndex) {
  const vertical = levelIndex % 2 === 1;
  const flipRows = Math.floor(levelIndex / 2) % 2 === 1;
  const flipCols = Math.floor(levelIndex / 4) % 2 === 1;
  const route = [];

  if (vertical) {
    for (let col = 0; col < COLS; col++) {
      for (let step = 0; step < ROWS; step++) {
        const row = col % 2 ? ROWS - 1 - step : step;
        route.push(row * COLS + col);
      }
    }
  } else {
    for (let row = 0; row < ROWS; row++) {
      for (let step = 0; step < COLS; step++) {
        const col = row % 2 ? COLS - 1 - step : step;
        route.push(row * COLS + col);
      }
    }
  }

  return route.map((tile) => {
    let row = Math.floor(tile / COLS);
    let col = tile % COLS;
    if (flipRows) row = ROWS - 1 - row;
    if (flipCols) col = COLS - 1 - col;
    return row * COLS + col;
  });
}

export const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, levelIndex) => {
  const difficulty =
    levelIndex < 10 ? "Easy" : levelIndex < 20 ? "Medium" : "Hard";
  const { letterCount, hazardCount } =
    difficulty === "Easy"
      ? { letterCount: 2, hazardCount: 3 }
      : difficulty === "Medium"
        ? { letterCount: 4, hazardCount: 8 }
        : { letterCount: 6, hazardCount: 13 };
  const letters = Array.from({ length: letterCount }, (_, index) =>
    String.fromCharCode(65 + index),
  );

  const solution = makeRoute(levelIndex);
  const tiles = Array(ROWS * COLS).fill(".");
  const letterPositions = letters.map((_, index) =>
    Math.round((index * (solution.length - 1)) / (letterCount - 1)),
  );
  letterPositions.forEach((position, index) => {
    tiles[solution[position]] = letters[index];
  });

  const otherTiles = solution.filter(
    (tile) => !letterPositions.some((position) => solution[position] === tile),
  );
  const hazards = Array.from({ length: hazardCount }, (_, index) =>
    ["-", ".", "★"][(index + levelIndex) % 3],
  );
  otherTiles.forEach((tile, index) => {
    tiles[tile] = index < hazardCount ? hazards[index] : "+";
  });

  return {
    name: `Level ${levelIndex + 1}`,
    difficulty,
    tiles,
    solution,
  };
});
