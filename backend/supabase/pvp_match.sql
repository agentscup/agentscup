-- Record PvP match result and update leaderboard for BOTH players atomically
create or replace function record_pvp_match_result(
  p_match_id uuid,
  p_home_user_id uuid,
  p_away_user_id uuid,
  p_home_score integer,
  p_away_score integer
) returns void as $$
begin
  -- Update match status
  update matches
    set status = 'finished',
        finished_at = now()
    where id = p_match_id;

  -- Update leaderboard for HOME player
  insert into leaderboard (user_id, team_name, played, won, drawn, lost, goals_for, goals_against, points)
    values (
      p_home_user_id, 'MY SQUAD', 1,
      case when p_home_score > p_away_score then 1 else 0 end,
      case when p_home_score = p_away_score then 1 else 0 end,
      case when p_home_score < p_away_score then 1 else 0 end,
      p_home_score, p_away_score,
      case when p_home_score > p_away_score then 3
           when p_home_score = p_away_score then 1
           else 0 end
    )
    on conflict (user_id) do update set
      played = leaderboard.played + 1,
      won = leaderboard.won + (case when p_home_score > p_away_score then 1 else 0 end),
      drawn = leaderboard.drawn + (case when p_home_score = p_away_score then 1 else 0 end),
      lost = leaderboard.lost + (case when p_home_score < p_away_score then 1 else 0 end),
      goals_for = leaderboard.goals_for + p_home_score,
      goals_against = leaderboard.goals_against + p_away_score,
      points = leaderboard.points + (
        case when p_home_score > p_away_score then 3
             when p_home_score = p_away_score then 1
             else 0 end
      );

  -- Update leaderboard for AWAY player (scores are reversed)
  insert into leaderboard (user_id, team_name, played, won, drawn, lost, goals_for, goals_against, points)
    values (
      p_away_user_id, 'MY SQUAD', 1,
      case when p_away_score > p_home_score then 1 else 0 end,
      case when p_home_score = p_away_score then 1 else 0 end,
      case when p_away_score < p_home_score then 1 else 0 end,
      p_away_score, p_home_score,
      case when p_away_score > p_home_score then 3
           when p_home_score = p_away_score then 1
           else 0 end
    )
    on conflict (user_id) do update set
      played = leaderboard.played + 1,
      won = leaderboard.won + (case when p_away_score > p_home_score then 1 else 0 end),
      drawn = leaderboard.drawn + (case when p_home_score = p_away_score then 1 else 0 end),
      lost = leaderboard.lost + (case when p_away_score < p_home_score then 1 else 0 end),
      goals_for = leaderboard.goals_for + p_away_score,
      goals_against = leaderboard.goals_against + p_home_score,
      points = leaderboard.points + (
        case when p_away_score > p_home_score then 3
             when p_home_score = p_away_score then 1
             else 0 end
      );
end;
$$ language plpgsql;
