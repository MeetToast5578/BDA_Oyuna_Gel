import * as migration_20260920_195825_baseline from './20260920_195825_baseline';
import * as migration_20260923_210137_arena_image_path from './20260923_210137_arena_image_path';
import * as migration_20260925_065346_media_uploaded_by from './20260925_065346_media_uploaded_by';
import * as migration_20261014_093046_keep_past_games_of_deleted_hosts from './20261014_093046_keep_past_games_of_deleted_hosts';
import * as migration_20261014_111042_user_email_notifications from './20261014_111042_user_email_notifications';

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
    name: '20261014_111042_user_email_notifications'
  },
];
