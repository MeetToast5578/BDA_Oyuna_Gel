import * as migration_20260920_195825_baseline from './20260920_195825_baseline';
import * as migration_20260923_210137_arena_image_path from './20260923_210137_arena_image_path';
import * as migration_20260925_065346_media_uploaded_by from './20260925_065346_media_uploaded_by';
import * as migration_20261014_093046_keep_past_games_of_deleted_hosts from './20261014_093046_keep_past_games_of_deleted_hosts';
import * as migration_20261014_111042_user_email_notifications from './20261014_111042_user_email_notifications';
import * as migration_20261014_114826_teams_sides_and_results from './20261014_114826_teams_sides_and_results';
import * as migration_20261014_115147_join_outcome_side_codes from './20261014_115147_join_outcome_side_codes';
import * as migration_20261019_185819_game_invites from './20261019_185819_game_invites';
import * as migration_20261019_192039_game_waitlist from './20261019_192039_game_waitlist';
import * as migration_20261022_081608_payload_3_91_reset_password_requested_at from './20261022_081608_payload_3_91_reset_password_requested_at';

export const migrations = [
  {
    up: migration_20260920_195825_baseline.up,
    down: migration_20260920_195825_baseline.down,
    name: '20260920_195825_baseline',
  },
  {
    up: migration_20260923_210137_arena_image_path.up,
    down: migration_20260923_210137_arena_image_path.down,
    name: '20260923_210137_arena_image_path',
  },
  {
    up: migration_20260925_065346_media_uploaded_by.up,
    down: migration_20260925_065346_media_uploaded_by.down,
    name: '20260925_065346_media_uploaded_by',
  },
  {
    up: migration_20261014_093046_keep_past_games_of_deleted_hosts.up,
    down: migration_20261014_093046_keep_past_games_of_deleted_hosts.down,
    name: '20261014_093046_keep_past_games_of_deleted_hosts',
  },
  {
    up: migration_20261014_111042_user_email_notifications.up,
    down: migration_20261014_111042_user_email_notifications.down,
    name: '20261014_111042_user_email_notifications',
  },
  {
    up: migration_20261014_114826_teams_sides_and_results.up,
    down: migration_20261014_114826_teams_sides_and_results.down,
    name: '20261014_114826_teams_sides_and_results',
  },
  {
    up: migration_20261014_115147_join_outcome_side_codes.up,
    down: migration_20261014_115147_join_outcome_side_codes.down,
    name: '20261014_115147_join_outcome_side_codes',
  },
  {
    up: migration_20261019_185819_game_invites.up,
    down: migration_20261019_185819_game_invites.down,
    name: '20261019_185819_game_invites',
  },
  {
    up: migration_20261019_192039_game_waitlist.up,
    down: migration_20261019_192039_game_waitlist.down,
    name: '20261019_192039_game_waitlist',
  },
  {
    up: migration_20261022_081608_payload_3_91_reset_password_requested_at.up,
    down: migration_20261022_081608_payload_3_91_reset_password_requested_at.down,
    name: '20261022_081608_payload_3_91_reset_password_requested_at'
  },
];
