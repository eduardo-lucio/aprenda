import { ConceptNode, StrandSummary } from '../../shared/types';

type Status = ConceptNode['status'];
type States = Record<string, Status>;
/** Only the concept of each answer matters here, in the order the answers were given. */
type Answered = ReadonlyArray<{ nodeId: string; identifiedMisconception?: string }>;

const MISSED: Status[] = ['false_positive', 'frontier', 'blind_spot'];

/**
 * A line of concepts that never breaks is not measured yet: a concept at the top of the map only
 * counts as held after a second, harder question.
 */
export const TOP_CONFIRMATIONS = 2;

export interface ProbeTarget {
  nodeId: string;
  /** The student already answered this concept with mastery: the next question must be harder. */
  escalate: boolean;
}

/**
 * Finds the edge of what the student knows by bracketing: the probe enters each line of the map
 * at the top, a miss walks it down by halves, and whatever sits above a miss is not asked at all.
 */
export class ProbeFrontier {
  private nodes: ConceptNode[];
  private ancestors = new Map<string, string[]>();
  private dependents = new Map<string, string[]>();

  constructor(nodes: ConceptNode[]) {
    this.nodes = nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const collect = (id: string, seen: Set<string>): void => {
      for (const p of byId.get(id)?.prerequisites || []) {
        if (seen.has(p) || !byId.has(p)) continue;
        seen.add(p);
        collect(p, seen);
      }
    };
    for (const n of nodes) {
      const seen = new Set<string>();
      collect(n.id, seen);
      this.ancestors.set(n.id, [...seen]);
      this.dependents.set(n.id, []);
    }
    for (const n of nodes) {
      for (const a of this.ancestors.get(n.id)!) this.dependents.get(a)!.push(n.id);
    }
  }

  private status(states: States, id: string): Status {
    return states[id] ?? 'untested';
  }

  private isMissed(states: States, id: string): boolean {
    return MISSED.includes(this.status(states, id));
  }

  private askedCount(attempts: Answered, id: string): number {
    return attempts.filter((a) => a.nodeId === id).length;
  }

  /** Nothing depends on it: it is where a line of the map ends. */
  isTop(id: string): boolean {
    return (this.dependents.get(id) || []).length === 0;
  }

  /** Not asked, and not worth asking: it depends on something the student missed. */
  isAboveCeiling(states: States, id: string): boolean {
    return (
      this.status(states, id) === 'untested' && (this.ancestors.get(id) || []).some((a) => this.isMissed(states, a))
    );
  }

  private isOpen(states: States, id: string): boolean {
    return this.status(states, id) === 'untested' && !this.isAboveCeiling(states, id);
  }

  private needsEscalation(states: States, attempts: Answered, id: string): boolean {
    return (
      this.isTop(id) && this.status(states, id) === 'mastered' && this.askedCount(attempts, id) < TOP_CONFIRMATIONS
    );
  }

  /** Its place relative to the edge is known: answered, inferred from a concept above, or above a miss. */
  isLocated(states: States, attempts: Answered, id: string): boolean {
    if (this.status(states, id) === 'untested') return this.isAboveCeiling(states, id);
    return !this.needsEscalation(states, attempts, id);
  }

  /** Share of the map whose position is known (0–100). */
  clarity(states: States, attempts: Answered): number {
    if (this.nodes.length === 0) return 0;
    const located = this.nodes.filter((n) => this.isLocated(states, attempts, n.id)).length;
    return Math.round((located / this.nodes.length) * 100);
  }

  /** The states after a mastered answer: what the concept is built on is taken as held too. */
  withMastered(states: States, id: string): States {
    const next: States = { ...states, [id]: 'mastered' };
    for (const a of this.ancestors.get(id) || []) {
      if (this.status(next, a) === 'untested') next[a] = 'mastered';
    }
    return next;
  }

  pickNext(states: States, attempts: Answered, currentId?: string): ProbeTarget {
    const level = (id: string) => this.nodes.find((n) => n.id === id)?.level ?? 1;

    // 1. Walk down from the latest miss: halve the range below it instead of stepping one level
    const seen = new Set<string>();
    for (let i = attempts.length - 1; i >= 0; i--) {
      const id = attempts[i].nodeId;
      if (seen.has(id)) continue;
      seen.add(id);
      if (!this.isMissed(states, id)) continue;
      const open = (this.ancestors.get(id) || []).filter((a) => this.isOpen(states, a));
      if (open.length === 0) continue;
      const levels = [...new Set(open.map(level))].sort((a, b) => a - b);
      const target = levels[Math.floor(levels.length / 2)];
      return { nodeId: open.find((a) => level(a) === target)!, escalate: false };
    }

    // 2. A top answered with mastery: push harder before trusting it
    const toEscalate = this.nodes.filter((n) => this.needsEscalation(states, attempts, n.id));
    if (toEscalate.length > 0) {
      return { nodeId: (toEscalate.find((n) => n.id === currentId) || toEscalate[0]).id, escalate: true };
    }

    // 3. Enter the next line at its top
    const open = this.nodes.filter((n) => this.isOpen(states, n.id)).sort((a, b) => b.level - a.level);
    if (open.length > 0) return { nodeId: open[0].id, escalate: false };

    // 4. Everything is located: confirm what was only inferred, then go around the misses again
    const missOrder: Status[] = ['false_positive', 'frontier', 'blind_spot'];
    const around = this.nodes
      .filter(
        (n) =>
          n.id !== currentId &&
          (this.isMissed(states, n.id) ||
            (this.status(states, n.id) === 'mastered' && this.askedCount(attempts, n.id) === 0))
      )
      .sort(
        (a, b) =>
          this.askedCount(attempts, a.id) - this.askedCount(attempts, b.id) ||
          missOrder.indexOf(this.status(states, a.id)) - missOrder.indexOf(this.status(states, b.id)) ||
          b.level - a.level
      );
    if (around.length > 0) return { nodeId: around[0].id, escalate: false };

    // 5. Everything is held and was asked directly: harder questions, spread around
    const rest = this.nodes
      .filter((n) => n.id !== currentId)
      .sort(
        (a, b) => this.askedCount(attempts, a.id) - this.askedCount(attempts, b.id) || b.level - a.level
      );
    const pick = rest[0] || this.nodes[this.nodes.length - 1];
    return { nodeId: pick.id, escalate: this.status(states, pick.id) === 'mastered' };
  }

  /** One entry per line of the map: what holds, where it breaks and the mistakes found on the way. */
  summarize(states: States, attempts: Answered): StrandSummary[] {
    return this.nodes
      .filter((n) => this.isTop(n.id))
      .map((top) => {
        const line = [top.id, ...(this.ancestors.get(top.id) || [])];
        const inLine = new Set(line);
        const floor = line.filter(
          (id) =>
            this.status(states, id) === 'mastered' &&
            !(this.dependents.get(id) || []).some((d) => inLine.has(d) && this.status(states, d) === 'mastered')
        );
        const ceiling = line.filter(
          (id) => this.isMissed(states, id) && !(this.ancestors.get(id) || []).some((a) => this.isMissed(states, a))
        );
        const misconceptions = [
          ...new Set(
            attempts
              .filter((a) => inLine.has(a.nodeId) && this.isMissed(states, a.nodeId) && a.identifiedMisconception)
              .map((a) => a.identifiedMisconception!.trim())
          ),
        ];
        return { topId: top.id, floor, ceiling, misconceptions };
      });
  }
}
