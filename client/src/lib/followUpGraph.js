/** Helpers for follow-up chat threads attached to a branch node. */

export function linkIds(link) {
  const s = typeof link.source === 'object' ? link.source.id : link.source;
  const t = typeof link.target === 'object' ? link.target.id : link.target;
  return { s, t };
}

/** Original branch node id + label (subtopic this thread is about). */
export function getFollowUpBranchAnchor(node, nodes) {
  if (node.followUp && node.followUpAnchorId) {
    const anchorNode = nodes.find((n) => n.id === node.followUpAnchorId);
    return {
      branchAnchorId: node.followUpAnchorId,
      anchorLabel: node.followUpAnchorLabel || anchorNode?.label || node.label,
    };
  }
  return {
    branchAnchorId: node.id,
    anchorLabel: node.label,
  };
}

export function getParentLabelForNode(nodeId, nodes, links, rootLabel) {
  for (const link of links) {
    const { s, t } = linkIds(link);
    if (t === nodeId) {
      const pn = nodes.find((n) => n.id === s);
      return pn?.label || rootLabel || '';
    }
  }
  return rootLabel || '';
}

/** Last node id in the linear follow-up chain under branchAnchorId (anchor itself if no FU children). */
export function getFollowUpChainLeafId(nodes, links, branchAnchorId) {
  let current = branchAnchorId;
  while (true) {
    const fuTargets = links
      .map((l) => linkIds(l))
      .filter(({ s, t }) => s === current && nodes.find((n) => n.id === t)?.followUp)
      .map(({ t }) => t);
    if (fuTargets.length === 0) return current;
    if (fuTargets.length === 1) {
      current = fuTargets[0];
      continue;
    }
    // Prefer single chain; if multiple FU branches, take first by node order
    fuTargets.sort(
      (a, b) => nodes.findIndex((n) => n.id === a) - nodes.findIndex((n) => n.id === b),
    );
    current = fuTargets[0];
  }
}

/** Ordered user/assistant pairs from walking the follow-up chain under anchor. */
export function collectFollowUpMessages(nodes, links, branchAnchorId) {
  const messages = [];
  let current = branchAnchorId;
  while (true) {
    const fuTargets = links
      .map((l) => linkIds(l))
      .filter(({ s, t }) => s === current && nodes.find((n) => n.id === t)?.followUp)
      .map(({ t }) => t);
    if (fuTargets.length === 0) break;
    const nextId = fuTargets.sort(
      (a, b) => nodes.findIndex((n) => n.id === a) - nodes.findIndex((n) => n.id === b),
    )[0];
    const n = nodes.find((x) => x.id === nextId);
    if (!n) break;
    messages.push({ role: 'user', content: n.followUpQuestion || n.label });
    messages.push({ role: 'assistant', content: n.followUpAnswer || '' });
    current = nextId;
  }
  return messages;
}

/** Drop empty lines and fix consecutive same-role turns before sending to /api/followup. */
export function normalizeFollowUpApiMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!content) continue;
    if (out.length > 0 && out[out.length - 1].role === m.role) {
      out[out.length - 1] = { role: m.role, content };
    } else {
      out.push({ role: m.role, content });
    }
  }
  return out;
}

const MAX_FOLLOWUP_API_MESSAGES = 20;

export function capFollowUpApiMessages(messages) {
  if (messages.length <= MAX_FOLLOWUP_API_MESSAGES) return messages;
  return messages.slice(-MAX_FOLLOWUP_API_MESSAGES);
}
