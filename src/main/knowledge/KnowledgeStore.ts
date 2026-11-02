import { ConceptNode } from '../../shared/types';

/**
 * In-memory store for the concept dependency graph of the current session.
 * Starts empty: the graph is generated dynamically by the AI from the student's goal.
 */
export class KnowledgeStore {
  private nodes: Map<string, ConceptNode>;

  constructor(initialNodes: ConceptNode[] = []) {
    this.nodes = new Map();
    this.setNodes(initialNodes);
  }

  setNodes(nodes: ConceptNode[]): void {
    this.nodes = new Map();
    for (const node of nodes) {
      this.nodes.set(node.id, { ...node, prerequisites: [...node.prerequisites] });
    }
  }

  clear(): void {
    this.nodes = new Map();
  }

  getNodes(): ConceptNode[] {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  getNodeById(id: string): ConceptNode | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  /** Recursive prerequisites (deepest roots first). */
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

  /** All nodes of the current (goal-specific) graph in topological/level order. */
  getStrand(): ConceptNode[] {
    return this.getNodes().sort((a, b) => a.level - b.level);
  }
}
