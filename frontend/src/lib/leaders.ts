import type { CompetitorResult, TopicResult } from "@/lib/types";

export type Leader = {
  domain: string;
  /** Times this domain appeared across sub-queries */
  appearances: number;
  /** Times ranked #1 (winner / first in source list) */
  firstPlaces: number;
  /** Mean source position when present (1 = best) */
  avgPosition: number | null;
  /**
   * Rank-weighted strength: #1 earns more than a late TechRadar-style mention.
   * Points: pos1=5, pos2=3, pos3=2, else=1
   */
  strength: number;
};

function pointsForPosition(pos: number): number {
  if (pos <= 1) return 5;
  if (pos === 2) return 3;
  if (pos === 3) return 2;
  return 1;
}

/**
 * Build a leaderboard that rewards early ranking, not just raw mention volume.
 */
export function computeLeaders(
  topics: TopicResult[],
  target: string,
  limit = 8
): Leader[] {
  const targetKey = target.toLowerCase();
  const map = new Map<
    string,
    { appearances: number; firstPlaces: number; positions: number[]; strength: number }
  >();

  const bump = (domain: string, pos: number) => {
    const key = domain.toLowerCase();
    if (!key || key === targetKey) return;
    const cur = map.get(key) || {
      appearances: 0,
      firstPlaces: 0,
      positions: [] as number[],
      strength: 0,
    };
    cur.appearances += 1;
    cur.positions.push(pos);
    cur.strength += pointsForPosition(pos);
    if (pos === 1) cur.firstPlaces += 1;
    map.set(key, cur);
  };

  for (const topic of topics) {
    for (const sq of topic.sub_queries || []) {
      const ordered: string[] = [];
      const seen = new Set<string>();

      // Winner is treated as #1 when present
      if (sq.winner) {
        const w = sq.winner.toLowerCase();
        if (w !== targetKey) {
          ordered.push(sq.winner);
          seen.add(w);
        }
      }

      const fromSources = (sq.sources || []).map((s) => s.domain);
      const fromDomains = sq.all_domains || [];
      for (const d of [...fromSources, ...fromDomains]) {
        const k = d.toLowerCase();
        if (!k || seen.has(k) || k === targetKey) continue;
        seen.add(k);
        ordered.push(d);
      }

      ordered.forEach((d, i) => bump(d, i + 1));
    }
  }

  return [...map.entries()]
    .map(([domain, v]) => ({
      domain,
      appearances: v.appearances,
      firstPlaces: v.firstPlaces,
      avgPosition:
        v.positions.length > 0
          ? v.positions.reduce((a, b) => a + b, 0) / v.positions.length
          : null,
      strength: v.strength,
    }))
    .sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;
      if (b.firstPlaces !== a.firstPlaces) return b.firstPlaces - a.firstPlaces;
      return b.appearances - a.appearances;
    })
    .slice(0, limit);
}

/** Map leaders into CompetitorResult shape for existing chart components. */
export function leadersAsCompetitors(leaders: Leader[]): CompetitorResult[] {
  const totalStrength = leaders.reduce((n, l) => n + l.strength, 0) || 1;
  return leaders.map((l) => ({
    domain: l.domain,
    citations: l.strength,
    presence: l.appearances,
    share_of_voice: l.strength / totalStrength,
  }));
}
