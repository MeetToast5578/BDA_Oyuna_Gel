import type { ResultFailure } from '@/lib/results'

/** HTTP status and Azerbaijani message of each refusal of the score routes. */
export const RESULT_ERRORS: Record<ResultFailure, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_NOT_FINISHED: { status: 409, message: 'Hesab yalnız oyun bitdikdən sonra daxil edilə bilər.' },
  FORBIDDEN: { status: 403, message: 'Hesabı yalnız rəqib komandanın oyunçusu təsdiq edə və ya ona etiraz edə bilər.' },
  RESULT_LOCKED: { status: 409, message: 'Hesab təsdiqlənib və dəyişdirilə bilməz.' },
  NOTHING_TO_CONFIRM: { status: 409, message: 'Təsdiq gözləyən hesab yoxdur.' },
}
