// Dart port of the pure match/stage predicates in shared/types/match.ts.
const _inPlay = {'LIVE', 'PAUSED', 'SUSPENDED', 'INTERRUPTED'};
const _started = {'LIVE', 'PAUSED', 'SUSPENDED', 'INTERRUPTED', 'FINISHED'};

bool matchIsInPlay(String status) => _inPlay.contains(status);
bool matchHasStarted(String status) => _started.contains(status);
bool isSingleMatchStage(String? stage) => stage == 'FINAL' || stage == 'THIRD_PLACE';
bool countsDouble(String? stage) => stage == 'FINAL';
bool isKnockout(String? stage) => stage != null && stage != 'GROUP';
