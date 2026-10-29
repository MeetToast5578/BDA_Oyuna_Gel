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
import * as migration_20261022_082941_rate_limits from './20261022_082941_rate_limits';
import * as migration_20261022_090732_schema_guards from './20261022_090732_schema_guards';
import * as migration_20261022_121601_arena_city_required from './20261022_121601_arena_city_required';
import * as migration_20261029_102657_notifications from './20261029_102657_notifications';
import * as migration_20261029_103533_game_group_link from './20261029_103533_game_group_link';
import * as migration_20261029_104048_attendance from './20261029_104048_attendance';
import * as migration_20261029_104811_push_and_reminders from './20261029_104811_push_and_reminders';

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
    name: '20261022_081608_payload_3_91_reset_password_requested_at',
  },
  {
    up: migration_20261022_082941_rate_limits.up,
    down: migration_20261022_082941_rate_limits.down,
    name: '20261022_082941_rate_limits',
  },
  {
    up: migration_20261022_090732_schema_guards.up,
    down: migration_20261022_090732_schema_guards.down,
    name: '20261022_090732_schema_guards',
  },
  {
    up: migration_20261022_121601_arena_city_required.up,
    down: migration_20261022_121601_arena_city_required.down,
    name: '20261022_121601_arena_city_required',
  },
  {
    up: migration_20261029_102657_notifications.up,
    down: migration_20261029_102657_notifications.down,
    name: '20261029_102657_notifications',
  },
  {
    up: migration_20261029_103533_game_group_link.up,
    down: migration_20261029_103533_game_group_link.down,
    name: '20261029_103533_game_group_link',
  },
  {
    up: migration_20261029_104048_attendance.up,
    down: migration_20261029_104048_attendance.down,
    name: '20261029_104048_attendance',
  },
  {
    up: migration_20261029_104811_push_and_reminders.up,
    down: migration_20261029_104811_push_and_reminders.down,
    name: '20261029_104811_push_and_reminders'
  },
];
