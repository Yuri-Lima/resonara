Farm sign-off gate: scripts/await-farm.js —
   polls state.json every 5s and exits 0 when
   state.status === 'FARM DONE'.
 Run the gate before publishing any qualification report.
