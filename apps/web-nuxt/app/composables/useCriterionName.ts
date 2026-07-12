import type { LeagueRewardCriterion } from '#shared/types/rewards'

// The display name of a league prize criterion. TEAM_SPECIALIST names its featured
// team when one is set, else falls back to the generic label.
export function useCriterionName() {
  const { t } = useI18n()
  return (type: LeagueRewardCriterion, teamCode: string | null): string => {
    if (type === 'TEAM_SPECIALIST') {
      return teamCode
        ? t('reward.criterion.TEAM_SPECIALIST.name', { team: teamCode })
        : t('reward.criterion.TEAM_SPECIALIST_GENERIC.name')
    }
    return t(`reward.criterion.${type}.name`)
  }
}
