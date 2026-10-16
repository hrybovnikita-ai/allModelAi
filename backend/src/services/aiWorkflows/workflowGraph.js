/**
 * Validate AI workflow graphs: acyclic, depth limits, no invalid edges.
 */

const MAX_NODES = Number(process.env.AI_WORKFLOW_MAX_NODES || 12);
const MAX_DEPTH = Number(process.env.AI_WORKFLOW_MAX_DEPTH || 8);

function validateWorkflowGraph(graph) {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph?.edges) ? graph.edges : [];
    if (!nodes.length) {
        const error = new Error('Workflow must include at least one step');
        error.status = 400;
        error.code = 'INVALID_GRAPH';
        throw error;
    }
    if (nodes.length > MAX_NODES) {
        const error = new Error(`Workflow exceeds max steps (${MAX_NODES})`);
        error.status = 400;
        error.code = 'WORKFLOW_TOO_LARGE';
        throw error;
    }

    const ids = new Set();
    for (const node of nodes) {
        const id = String(node.id || '').trim();
        if (!id) {
            const error = new Error('Each step requires an id');
            error.status = 400;
            throw error;
        }
        if (ids.has(id)) {
            const error = new Error(`Duplicate step id: ${id}`);
            error.status = 400;
            throw error;
        }
        ids.add(id);
        if (!node.model && !node.provider) {
            const error = new Error(`Step ${id} requires a model`);
            error.status = 400;
            throw error;
        }
        if (node.requiresApproval && node.externalAction && !node.approved) {
            const error = new Error(`Step ${id} requires explicit approval before external actions`);
            error.status = 400;
            error.code = 'APPROVAL_REQUIRED';
            throw error;
        }
    }

    const adjacency = new Map([...ids].map((id) => [id, []]));
    for (const edge of edges) {
        const from = String(edge.from || edge.source || '').trim();
        const to = String(edge.to || edge.target || '').trim();
        if (!ids.has(from) || !ids.has(to)) {
            const error = new Error('Edge references unknown step');
            error.status = 400;
            throw error;
        }
        adjacency.get(from).push(to);
    }

    // Cycle detection (DFS)
    const visiting = new Set();
    const visited = new Set();
    function visit(nodeId, depth) {
        if (depth > MAX_DEPTH) {
            const error = new Error(`Workflow depth exceeds ${MAX_DEPTH}`);
            error.status = 400;
            error.code = 'WORKFLOW_TOO_DEEP';
            throw error;
        }
        if (visiting.has(nodeId)) {
            const error = new Error('Workflow contains a cycle');
            error.status = 400;
            error.code = 'WORKFLOW_CYCLE';
            throw error;
        }
        if (visited.has(nodeId)) return;
        visiting.add(nodeId);
        for (const next of adjacency.get(nodeId) || []) {
            visit(next, depth + 1);
        }
        visiting.delete(nodeId);
        visited.add(nodeId);
    }
    for (const id of ids) visit(id, 1);

    return { nodes, edges, nodeCount: nodes.length };
}

function topologicalOrder(graph) {
    const { nodes, edges } = validateWorkflowGraph(graph);
    const indegree = new Map(nodes.map((n) => [String(n.id), 0]));
    const adjacency = new Map(nodes.map((n) => [String(n.id), []]));
    for (const edge of edges) {
        const from = String(edge.from || edge.source);
        const to = String(edge.to || edge.target);
        adjacency.get(from).push(to);
        indegree.set(to, (indegree.get(to) || 0) + 1);
    }
    const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const order = [];
    while (queue.length) {
        const id = queue.shift();
        order.push(id);
        for (const next of adjacency.get(id) || []) {
            indegree.set(next, indegree.get(next) - 1);
            if (indegree.get(next) === 0) queue.push(next);
        }
    }
    return order.map((id) => nodes.find((n) => String(n.id) === id));
}

const WORKFLOW_TEMPLATES = [
    {
        id: 'doc-analyze-summarize-report',
        name: 'Document → Summary → Report',
        description: 'Analyze a document, summarize findings, then produce a final report.',
        graph: {
            nodes: [
                { id: 'analyze', label: 'Analyze', model: 'gemini', prompt: 'Analyze the input document.' },
                { id: 'summarize', label: 'Summarize', model: 'claude', prompt: 'Summarize the analysis.' },
                { id: 'report', label: 'Report', model: 'gpt', prompt: 'Write a final report from the summary.' },
            ],
            edges: [
                { from: 'analyze', to: 'summarize' },
                { from: 'summarize', to: 'report' },
            ],
        },
    },
];

module.exports = {
    MAX_NODES,
    MAX_DEPTH,
    validateWorkflowGraph,
    topologicalOrder,
    WORKFLOW_TEMPLATES,
};
