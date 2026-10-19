-- Add lookup indexes without changing or deleting existing score records.
CREATE INDEX IF NOT EXISTS leaderboard_scores_target_day
  ON leaderboard_scores (target, created_at);
CREATE INDEX IF NOT EXISTS runner_leaderboard_scores_day
  ON runner_leaderboard_scores (created_at);
