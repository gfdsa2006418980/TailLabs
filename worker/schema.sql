CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  target INTEGER NOT NULL CHECK (target IN (10, 50, 100, 500)),
  placed_count INTEGER NOT NULL CHECK (placed_count >= 0 AND placed_count <= target),
  dropped_count INTEGER NOT NULL CHECK (dropped_count >= placed_count AND dropped_count <= target),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  max_height INTEGER NOT NULL CHECK (max_height >= 0),
  base_score INTEGER NOT NULL CHECK (base_score >= 0),
  height_bonus INTEGER NOT NULL CHECK (height_bonus >= 0),
  speed_bonus INTEGER NOT NULL CHECK (speed_bonus >= 0),
  score INTEGER NOT NULL CHECK (score >= 0),
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS leaderboard_scores_target_rank
  ON leaderboard_scores (target, completed DESC, score DESC, elapsed_ms ASC, created_at ASC);
