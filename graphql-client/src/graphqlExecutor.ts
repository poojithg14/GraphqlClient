export interface ExecuteOptions {
  endpoint: string;
  query: string;
  variables: string;
  headers: Record<string, string>;
}

export interface ExecuteResult {
  data: unknown;
  responseTime: number;
}

export async function executeGraphQLQuery(options: ExecuteOptions): Promise<ExecuteResult> {
  const { endpoint, query, variables, headers } = options;

  // Parse variables JSON
  let parsedVariables: Record<string, unknown> | undefined;
  if (variables && variables.trim()) {
    try {
      parsedVariables = JSON.parse(variables);
    } catch {
      throw new Error('Invalid variables JSON: ' + variables);
    }
  }

  // Extract operation name from query
  const operationMatch = query.match(/(?:query|mutation|subscription)\s+(\w+)/);
  const operationName = operationMatch ? operationMatch[1] : undefined;

  // Build request body
  const body: Record<string, unknown> = { query };
  if (parsedVariables && Object.keys(parsedVariables).length > 0) {
    body.variables = parsedVariables;
  }
  if (operationName) {
    body.operationName = operationName;
  }

  const start = performance.now();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const responseTime = Math.round(performance.now() - start);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${response.statusText}${text ? '\n' + text : ''}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Failed to parse response as JSON');
  }

  return { data, responseTime };
}
