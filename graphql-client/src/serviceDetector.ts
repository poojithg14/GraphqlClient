import * as vscode from 'vscode';

const COMMON_PORTS = [4000, 3000, 8080, 5000, 8000];
const GRAPHQL_PATHS = ['/graphql', '/api/graphql'];
const PROBE_TIMEOUT = 800;

/**
 * Detect a running GraphQL endpoint by scanning workspace package.json
 * for port hints, then probing candidate ports.
 */
export async function detectGraphQLEndpoint(): Promise<string> {
  const hintPorts = await extractPortHints();

  // Deduplicate: hint ports first, then common ports
  const candidatePorts = [...new Set([...hintPorts, ...COMMON_PORTS])];

  // Build all probe URLs
  const probes: string[] = [];
  for (const port of candidatePorts) {
    for (const path of GRAPHQL_PATHS) {
      probes.push(`http://localhost:${port}${path}`);
    }
  }

  // Run all probes in parallel
  const results = await Promise.allSettled(
    probes.map(url => probeEndpoint(url))
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      return probes[i];
    }
  }

  return '';
}

async function extractPortHints(): Promise<number[]> {
  const ports: number[] = [];

  try {
    const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 10);
    for (const file of files) {
      const data = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(data).toString('utf-8');
      try {
        const pkg = JSON.parse(text);
        if (pkg.scripts && typeof pkg.scripts === 'object') {
          for (const script of Object.values(pkg.scripts) as string[]) {
            // Match patterns like --port 4000, PORT=3000, localhost:8080
            const portPatterns = [
              /--port\s+(\d+)/g,
              /PORT[=\s]+(\d+)/g,
              /localhost:(\d+)/g,
            ];
            for (const pattern of portPatterns) {
              let match: RegExpExecArray | null;
              while ((match = pattern.exec(script)) !== null) {
                const port = parseInt(match[1], 10);
                if (port > 0 && port < 65536 && !ports.includes(port)) {
                  ports.push(port);
                }
              }
            }
          }
        }
      } catch {
        // Skip unparseable package.json
      }
    }
  } catch {
    // Workspace search failed — continue with common ports
  }

  return ports;
}

async function probeEndpoint(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: controller.signal,
    });

    if (!response.ok) return false;

    const body = await response.json() as Record<string, unknown>;
    return 'data' in body || 'errors' in body;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
