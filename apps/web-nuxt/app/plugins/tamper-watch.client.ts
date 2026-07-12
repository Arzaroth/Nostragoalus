// Witness the commitment chain once per load: compare the served head against the
// one this device pinned last visit (localStorage) and flag a silent retro-edit.
// Fire-and-forget so it never blocks hydration or a prediction.
export default defineNuxtPlugin(() => {
  const { check } = useTamperWatch()
  void check()
})
