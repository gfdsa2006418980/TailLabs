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

CREATE TABLE IF NOT EXISTS runner_leaderboard_scores (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  distance INTEGER NOT NULL CHECK (distance >= 0),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  coins INTEGER NOT NULL CHECK (coins >= 0),
  multiplier REAL NOT NULL CHECK (multiplier >= 1 AND multiplier <= 5),
  score INTEGER NOT NULL CHECK (score >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS runner_leaderboard_scores_rank
  ON runner_leaderboard_scores (score DESC, elapsed_ms ASC, coins DESC, distance DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS leaderboard_scores_target_day
  ON leaderboard_scores (target, created_at);
CREATE INDEX IF NOT EXISTS runner_leaderboard_scores_day
  ON runner_leaderboard_scores (created_at);
