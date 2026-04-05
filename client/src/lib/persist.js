/**
 * Persistence helpers for localStorage.
 *
 * Handles three quirks:
 *  1. Map/Set are not JSON-serialisable → convert to arrays of entries / values
 *  2. D3 mutates link.source / link.target from string IDs to node objects
 *     (creating circular refs that break JSON.stringify) → normalise before saving
 *  3. localStorage can be full → try/catch with QuotaExceeded retry (slim payload)
 */

export const MAX_SAVED_SESSIONS = 25;

const KEYS = {
  LIVE: 'rabbit-hole-live',
  SESSIONS: 'rabbit-hole-sessions',
  MODE: 'rabbit-hole-mode',
  EXPLAIN_MODE: 'rabbit-hole-explain-mode',
};

function sessionRecency(s) {
  return s.lastUsedAt ?? s.createdAt ?? 0;
}

/**
 * Newest-first, at most `max` sessions. If `activeSessionId` is set and would be
 * evicted, keep it and drop one more of the others.
 */
export function capSessionsByRecency(sessions, max, activeSessionId = null) {
  if (!Array.isArray(sessions) || sessions.length <= max) return sessions;
  const sorted = [...sessions].sort((a, b) => sessionRecency(b) - sessionRecency(a));
  let kept = sorted.slice(0, max);
  if (activeSessionId) {
    const hasActive = kept.some((s) => s.id === activeSessionId);
    if (!hasActive) {
      const active = sessions.find((s) => s.id === activeSessionId);
      if (active) {
        kept = [
          active,
          ...sorted.filter((s) => s.id !== activeSessionId).slice(0, max - 1),
        ];
      }
    }
  }
  return kept;
}

export function isStorageQuotaError(e) {
  if (!e) return false;
  if (e.name === 'QuotaExceededError') return true;
  return e instanceof DOMException && e.code === 22;
}

// ─── Link normalisation ───────────────────────────────────────────────────────

function normalizeLinks(links) {
  return links.map((l) => ({
    source: typeof l.source === 'object' ? l.source.id : l.source,
    target: typeof l.target === 'object' ? l.target.id : l.target,
  }));
}

// ─── Snapshot serialisation ───────────────────────────────────────────────────

function serializeSnap(snap) {
  return {
    graphData: {
      nodes: snap.graphData.nodes,
      links: normalizeLinks(snap.graphData.links),
    },
    expandedNodes: [...snap.expandedNodes],
    rootLabel: snap.rootLabel,
    sessionTopic: snap.sessionTopic || '',
    groundingContext: snap.groundingContext || '',
    parentLabelOf: [...snap.parentLabelOf.entries()],
    originalPosition: [...snap.originalPosition.entries()],
    explanationCache: [...snap.explanationCache.entries()],
    expandDataCache: [...snap.expandDataCache.entries()],
  };
}

function serializeSnapSlim(snap) {
  return {
    ...serializeSnap(snap),
    explanationCache: [],
    expandDataCache: [],
  };
}

function deserializeSnap(raw) {
  return {
    graphData: raw.graphData,
    expandedNodes: new Set(raw.expandedNodes),
    rootLabel: raw.rootLabel,
    sessionTopic: raw.sessionTopic || '',
    groundingContext: raw.groundingContext || '',
    parentLabelOf: new Map(raw.parentLabelOf),
    originalPosition: new Map(raw.originalPosition),
    explanationCache: new Map(raw.explanationCache),
    expandDataCache: new Map(raw.expandDataCache),
  };
}

// ─── Live graph ───────────────────────────────────────────────────────────────

export function saveLive({ snap, topic, mode, activeSessionId, shareId, explorationPathIds }) {
  if (!snap.graphData.nodes.length) return { ok: true };
  const path = Array.isArray(explorationPathIds) ? explorationPathIds : [];
  const payloadFull = {
    ...serializeSnap(snap),
    topic,
    mode,
    activeSessionId: activeSessionId ?? null,
    shareId: shareId ?? null,
    explorationPathIds: path,
  };
  const payloadSlim = {
    ...serializeSnapSlim(snap),
    topic,
    mode,
    activeSessionId: activeSessionId ?? null,
    shareId: shareId ?? null,
    explorationPathIds: path,
  };
  try {
    localStorage.setItem(KEYS.LIVE, JSON.stringify(payloadFull));
    return { ok: true };
  } catch (e) {
    if (!isStorageQuotaError(e)) {
      console.warn('[persist] saveLive failed', e);
      return { ok: false };
    }
    try {
      localStorage.setItem(KEYS.LIVE, JSON.stringify(payloadSlim));
      console.warn('[persist] saveLive: storage quota — saved without explanation caches');
      return { ok: true, strippedCaches: true };
    } catch (e2) {
      console.warn('[persist] saveLive: quota retry failed', e2);
      return { ok: false, quotaExceeded: true };
    }
  }
}

export function loadLive() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS.LIVE) || 'null');
    if (!raw || !raw.graphData?.nodes?.length) return null;
    const snap = deserializeSnap(raw);
    if (!snap.sessionTopic && raw.topic) snap.sessionTopic = raw.topic;
    if (!snap.groundingContext && raw.groundingContext) snap.groundingContext = raw.groundingContext;
    return {
      snap,
      topic: raw.topic,
      mode: raw.mode,
      activeSessionId: raw.activeSessionId ?? null,
      shareId: raw.shareId ?? null,
      explorationPathIds: Array.isArray(raw.explorationPathIds) ? raw.explorationPathIds : [],
    };
  } catch {
    return null;
  }
}

export function clearLive() {
  localStorage.removeItem(KEYS.LIVE);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function serializeSession(s) {
  return {
    ...s,
    expandedNodes: [...s.expandedNodes],
    parentLabelOf: [...s.parentLabelOf.entries()],
    originalPosition: [...s.originalPosition.entries()],
    explanationCache: [...s.explanationCache.entries()],
    expandDataCache: [...s.expandDataCache.entries()],
    graphData: {
      nodes: s.graphData.nodes,
      links: normalizeLinks(s.graphData.links),
    },
  };
}

function serializeSessionSlim(s) {
  const base = serializeSession(s);
  return {
    ...base,
    explanationCache: [],
    expandDataCache: [],
  };
}

function deserializeSession(raw) {
  return {
    ...raw,
    expandedNodes: new Set(raw.expandedNodes),
    parentLabelOf: new Map(raw.parentLabelOf),
    originalPosition: new Map(raw.originalPosition),
    explanationCache: new Map(raw.explanationCache),
    expandDataCache: new Map(raw.expandDataCache),
  };
}

/**
 * @returns {{ ok: true, strippedCaches?: boolean } | { ok: false, quotaExceeded?: boolean }}
 */
export function saveSessions(sessions) {
  const full = JSON.stringify(sessions.map(serializeSession));
  try {
    localStorage.setItem(KEYS.SESSIONS, full);
    return { ok: true };
  } catch (e) {
    if (!isStorageQuotaError(e)) {
      console.warn('[persist] saveSessions failed', e);
      return { ok: false };
    }
    try {
      const slim = JSON.stringify(sessions.map(serializeSessionSlim));
      localStorage.setItem(KEYS.SESSIONS, slim);
      console.warn('[persist] saveSessions: storage quota — saved without explanation caches');
      return { ok: true, strippedCaches: true };
    } catch (e2) {
      console.warn('[persist] saveSessions: quota retry failed', e2);
      return { ok: false, quotaExceeded: true };
    }
  }
}

export function loadSessions() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS.SESSIONS) || '[]');
    return Array.isArray(raw) ? raw.map(deserializeSession) : [];
  } catch {
    return [];
  }
}

// ─── Share snapshot ───────────────────────────────────────────────────────────
// Strips caches — recipient re-fetches explanations lazily on demand.
// Strips follow-up chat nodes — share is the main exploration only.

export function stripFollowUpNodesForShare(snap) {
  const rawNodes = snap.graphData?.nodes || [];
  const nodes = rawNodes.filter((n) => !n.followUp);
  const keep = new Set(nodes.map((n) => n.id));
  const links = (snap.graphData?.links || []).filter((l) => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return keep.has(s) && keep.has(t);
  });
  const expandedNodes = new Set(
    [...(snap.expandedNodes || [])].filter((id) => keep.has(id)),
  );
  const parentLabelOf = new Map(
    [...(snap.parentLabelOf || new Map()).entries()].filter(([id]) => keep.has(id)),
  );
  const originalPosition = new Map(
    [...(snap.originalPosition || new Map()).entries()].filter(([id]) => keep.has(id)),
  );
  return {
    ...snap,
    graphData: { nodes, links },
    expandedNodes,
    parentLabelOf,
    originalPosition,
  };
}

export function serializeShareSnap(snap, topic) {
  const s = stripFollowUpNodesForShare(snap);
  return {
    topic: topic || '',
    groundingContext: s.groundingContext || '',
    graphData: {
      nodes: s.graphData.nodes,
      links: normalizeLinks(s.graphData.links),
    },
    rootLabel: s.rootLabel || '',
    expandedNodes: [...s.expandedNodes],
    parentLabelOf: [...s.parentLabelOf.entries()],
    originalPosition: [...s.originalPosition.entries()],
  };
}

export function deserializeShareSnap(raw) {
  return {
    graphData: raw.graphData,
    rootLabel: raw.rootLabel,
    sessionTopic: raw.topic || '',
    groundingContext: raw.groundingContext || '',
    expandedNodes: new Set(raw.expandedNodes),
    parentLabelOf: new Map(raw.parentLabelOf),
    originalPosition: new Map(raw.originalPosition),
    explanationCache: new Map(),
    expandDataCache: new Map(),
  };
}

// ─── Mode preference ──────────────────────────────────────────────────────────

export function saveMode(mode) {
  try {
    localStorage.setItem(KEYS.MODE, mode);
  } catch (e) {
    if (isStorageQuotaError(e)) console.warn('[persist] saveMode: storage quota');
    else console.warn('[persist] saveMode failed', e);
  }
}

export function loadMode() {
  return localStorage.getItem(KEYS.MODE) || 'slow';
}

// ─── Explain depth preference ─────────────────────────────────────────────────

export function saveExplainMode(mode) {
  try {
    localStorage.setItem(KEYS.EXPLAIN_MODE, mode);
  } catch (e) {
    if (isStorageQuotaError(e)) console.warn('[persist] saveExplainMode: storage quota');
    else console.warn('[persist] saveExplainMode failed', e);
  }
}

export function loadExplainMode() {
  return localStorage.getItem(KEYS.EXPLAIN_MODE) || 'normal';
}
