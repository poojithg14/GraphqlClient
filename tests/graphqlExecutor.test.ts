import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeGraphQLQuery } from '../src/graphqlExecutor';

/** Helper to create a mock Response object */
function mockResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  textBody?: string;
}): Response {
  const ok = opts.ok ?? true;
  const status = opts.status ?? 200;
  const statusText = opts.statusText ?? 'OK';
  const bodyText = opts.textBody ?? JSON.stringify(opts.body ?? {});

  return {
    ok,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(bodyText),
    json: vi.fn().mockResolvedValue(opts.body),
    headers: new Headers(),
  } as unknown as Response;
}

describe('executeGraphQLQuery', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // Stub performance.now for deterministic timing
    let callCount = 0;
    vi.stubGlobal('performance', {
      now: vi.fn(() => {
        callCount += 1;
        // First call returns 1000, second returns 1042 => 42ms
        return callCount === 1 ? 1000 : 1042;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('URL validation', () => {
    it('rejects non-http/https URLs', async () => {
      await expect(
        executeGraphQLQuery({
          endpoint: 'ftp://example.com/graphql',
          query: '{ hello }',
          variables: '',
          headers: {},
        }),
      ).rejects.toThrow('Unsupported protocol');
    });

    it('rejects invalid URLs', async () => {
      await expect(
        executeGraphQLQuery({
          endpoint: 'not-a-url',
          query: '{ hello }',
          variables: '',
          headers: {},
        }),
      ).rejects.toThrow('Invalid endpoint URL');
    });
  });

  it('extracts operation name from query', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ body: { data: { hello: 'world' } } }),
    );

    await executeGraphQLQuery({
      endpoint: 'https://api.example.com/graphql',
      query: 'query GetHello { hello }',
      variables: '',
      headers: {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(callBody.operationName).toBe('GetHello');
  });

  it('parses variables JSON', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ body: { data: { user: { id: '1' } } } }),
    );

    await executeGraphQLQuery({
      endpoint: 'https://api.example.com/graphql',
      query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
      variables: '{"id": "1"}',
      headers: {},
    });

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(callBody.variables).toEqual({ id: '1' });
  });

  it('throws on invalid variables JSON', async () => {
    await expect(
      executeGraphQLQuery({
        endpoint: 'https://api.example.com/graphql',
        query: '{ hello }',
        variables: '{ broken json',
        headers: {},
      }),
    ).rejects.toThrow('Invalid variables JSON');
  });

  it('returns response data, time, status, and size', async () => {
    const responseBody = { data: { hello: 'world' } };
    const bodyText = JSON.stringify(responseBody);
    fetchMock.mockResolvedValue(
      mockResponse({ body: responseBody, textBody: bodyText, status: 200 }),
    );

    const result = await executeGraphQLQuery({
      endpoint: 'https://api.example.com/graphql',
      query: '{ hello }',
      variables: '',
      headers: {},
    });

    expect(result.data).toEqual(responseBody);
    expect(result.responseTime).toBe(42);
    expect(result.statusCode).toBe(200);
    expect(result.responseSize).toBe(new TextEncoder().encode(bodyText).length);
  });

  it('throws on non-OK response with status text', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        textBody: 'Access denied',
      }),
    );

    await expect(
      executeGraphQLQuery({
        endpoint: 'https://api.example.com/graphql',
        query: '{ hello }',
        variables: '',
        headers: {},
      }),
    ).rejects.toThrow('HTTP 403: Forbidden');
  });
});
