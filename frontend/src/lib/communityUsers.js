export function parseCommunityUsersPayload(data) {
  if (Array.isArray(data?.users)) {
    return data.users.filter((user) => user && user.id != null && user.name);
  }
  if (Array.isArray(data)) {
    return data
      .filter((user) => user && user.id != null && user.name)
      .map(({ id, name }) => ({ id, name }));
  }
  return null;
}
