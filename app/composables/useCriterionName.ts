import type { CompetitionAwardType } from '#shared/types/achievements'

// The display name of an award criterion. TEAM_SPECIALIST names its featured team
// when one is set, else falls back to the generic label.
export function useCriterionName() {
  const { t } = useI18n()
  return (type: CompetitionAwardType, teamCode: string | null): string => {
    if (type === 'TEAM_SPECIALIST') {
      return teamCode
        ? t('achievements.trophy.TEAM_SPECIALIST.name', { team: teamCode })
        : t('achievements.trophy.TEAM_SPECIALIST_GENERIC.name')
    }
    return t(`achievements.trophy.${type}.name`)
  }
}
