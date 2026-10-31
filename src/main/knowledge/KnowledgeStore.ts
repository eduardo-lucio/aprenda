import { ConceptNode } from '../../shared/types';
import { NETWORK_LAYER_3_NODES } from './networkLayer3Nodes';

export class KnowledgeStore {
  private nodes: Map<string, ConceptNode>;

  constructor(initialNodes: ConceptNode[] = NETWORK_LAYER_3_NODES) {
    this.nodes = new Map();
    for (const node of initialNodes) {
      this.nodes.set(node.id, { ...node });
    }
  }

  getNodes(): ConceptNode[] {
    return Array.from(this.nodes.values());
  }

  getNodeById(id: string): ConceptNode | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  getPrerequisites(id: string): ConceptNode[] {
    const visited = new Set<string>();
    const result: ConceptNode[] = [];

    const traverse = (nodeId: string) => {
      const node = this.nodes.get(nodeId);
      if (!node) return;

      for (const prereqId of node.prerequisites) {
        if (!visited.has(prereqId)) {
          visited.add(prereqId);
          traverse(prereqId);
          const prereqNode = this.nodes.get(prereqId);
          if (prereqNode) {
            result.push({ ...prereqNode });
          }
        }
      }
    };

    traverse(id);
    return result;
  }

  getStrandForGoal(goalText: string): ConceptNode[] {
    const lower = (goalText || '').toLowerCase();
    const all = this.getNodes();

    // Check if goal names specific topics
    const matched = all.filter((n) =>
      lower.includes(n.id.toLowerCase()) ||
      lower.includes(n.title.toLowerCase()) ||
      lower.split(/\s+/).some((w) => w.length > 2 && (n.title.toLowerCase().includes(w) || n.summary.toLowerCase().includes(w)))
    );

    if (matched.length === 0) {
      // Default topological order by level
      return [...all].sort((a, b) => a.level - b.level);
    }

    // Build strand with targets and all their prerequisites
    const strandSet = new Set<string>();
    const strandNodes: ConceptNode[] = [];

    for (const target of matched) {
      const prereqs = this.getPrerequisites(target.id);
      for (const p of prereqs) {
        if (!strandSet.has(p.id)) {
          strandSet.add(p.id);
          strandNodes.push(p);
        }
      }
      if (!strandSet.has(target.id)) {
        strandSet.add(target.id);
        strandNodes.push(target);
      }
    }

    return strandNodes.sort((a, b) => a.level - b.level);
  }
}
