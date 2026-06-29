import { withLeagueSelection } from '~/utils/league-cookie'

// A chat-mention push/bell link lands as `?ngLeague=<id>&chat=<matchId|global>`
// (see chatMentionPath in shared/types/notifications). Point the league cookie at
// that league for the page's competition so the dock resolves the right chat, ask
// the dock to open to that room, then strip the params so a refresh or bookmark
// does not re-fire and the URL stays clean.
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const selections = useLeagueSelections()
  const dock = useChatDockOpen()

  watch(
    () => route.query,
    (q) => {
      const query = q ?? {}
      const ngLeague = typeof query.ngLeague === 'string' ? query.ngLeague : null
      const chat = typeof query.chat === 'string' ? query.chat : null
      if (!ngLeague || !chat) return
      const slug = typeof route.params.competition === 'string' ? route.params.competition : null
      if (slug) selections.value = withLeagueSelection(selections.value, slug, ngLeague)
      dock.requestOpenRoom(chat === 'global' ? 'global' : 'match')
      const rest = { ...query }
      delete rest.ngLeague
      delete rest.chat
      void navigateTo({ path: route.path, query: rest }, { replace: true })
    },
    { immediate: true },
  )
})
