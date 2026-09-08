/**
 * Which tool groups a server exposes.
 *
 * The set comes from EXACT_TOOLS by default. A host that builds a server per
 * tenant passes the groups in instead, because process.env cannot differ per
 * tenant within one process.
 */

/** Parse a group list: a comma-separated string or an array. Empty means all groups. */
export function groupsFrom(tools: string[] | string | null | undefined): Set<string> | null {
  if (tools === null || tools === undefined) return null;
  const list = Array.isArray(tools) ? tools : tools.split(",");
  const set = new Set(list.map((s) => s.trim()).filter(Boolean));
  return set.size > 0 ? set : null; // an empty selection means "no filter", not "no tools"
}

export function enabledGroups(
  env: string | undefined = process.env.EXACT_TOOLS
): Set<string> | null {
  return groupsFrom(env);
}

export function isGroupEnabled(group: string, enabled: Set<string> | null): boolean {
  return enabled === null || enabled.has(group);
}
