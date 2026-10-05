export function shouldShowWebSearchCompleted(complete, sourceCount) {
  return complete === true && Number(sourceCount) > 0;
}

export function shouldShowWebSearchUnavailable(unavailable) {
  return unavailable === true;
}
