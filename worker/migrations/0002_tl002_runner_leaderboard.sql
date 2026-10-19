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
