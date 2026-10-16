export function shouldShowWebSearchCompleted(complete, sourceCount) {
  return complete === true && Number(sourceCount) > 0;
}

export function shouldShowWebSearchUnavailable(unavailable) {
  return unavailable === true;
}

export const WEB_SEARCH_PROGRESS_STAGES = [
  { id: 'searching', label: 'Searching the Web', match: ['searching'] },
  { id: 'finding_sources', label: 'Finding Sources', match: ['finding_sources', 'found'] },
  { id: 'checking', label: 'Checking Information', match: ['checking', 'reading', 'analyzing'] },
  { id: 'generating', label: 'Generating Answer', match: ['generating', 'writing'] },
];

export function webSearchStageIndex(status) {
  const idx = WEB_SEARCH_PROGRESS_STAGES.findIndex((stage) => stage.match.includes(status));
  if (idx >= 0) return idx;
  if (status === 'no_sources' || status === 'search_unavailable') return -1;
  return 0;
}
