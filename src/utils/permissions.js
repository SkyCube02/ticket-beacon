const ROLE_RANK = {
  AGENT: 1,
  SENIOR_AGENT: 2,
  TEAM_MANAGER: 3,
  SYSTEM_ADMIN: 4,
};

export function atLeast(user, role) {
  return (ROLE_RANK[user?.role] ?? 0) >= (ROLE_RANK[role] ?? 99);
}
