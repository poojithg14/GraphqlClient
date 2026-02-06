import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Save, 
  Copy, 
  Clock,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  History,
  FileCode,
  Settings2,
  RefreshCw
} from 'lucide-react';
import { useGraphQL } from '../App';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import GraphQLEditor from './GraphQLEditor';
import ResponseViewer from './ResponseViewer';

const EditorPanel = () => {
  const { 
    activeRequest, 
    openTabs, 
    closeTab, 
    setActiveRequest,
    updateRequest,
    environments,
    switchEnvironment,
    resolveSecrets,
    addToHistory,
    history
  } = useGraphQL();

  const [query, setQuery] = useState('');
  const [variables, setVariables] = useState('{}');
  const [headers, setHeaders] = useState('{}');
  const [response, setResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [responseTime, setResponseTime] = useState(null);
  const [activeTab, setActiveTab] = useState('query');
  const [responseTab, setResponseTab] = useState('response');

  useEffect(() => {
    if (activeRequest) {
      setQuery(activeRequest.query || '');
      setVariables(activeRequest.variables || '{}');
      setHeaders(JSON.stringify(activeRequest.headers || {}, null, 2));
      setResponse(null);
      setResponseTime(null);
    }
  }, [activeRequest?.id]);

  const activeEnv = environments.envs[environments.active];

  const executeQuery = async () => {
    if (!activeRequest) return;
    
    setIsLoading(true);
    setResponse(null);
    const startTime = performance.now();

    try {
      // Parse variables
      let parsedVariables = {};
      try {
        parsedVariables = JSON.parse(variables || '{}');
      } catch (e) {
        throw new Error('Invalid JSON in variables');
      }

      // Parse custom headers
      let customHeaders = {};
      try {
        customHeaders = JSON.parse(headers || '{}');
      } catch (e) {
        throw new Error('Invalid JSON in headers');
      }

      // Resolve environment headers
      const resolvedEnvHeaders = {};
      for (const [key, value] of Object.entries(activeEnv.headers || {})) {
        resolvedEnvHeaders[key] = resolveSecrets(value);
      }

      // Merge headers
      const finalHeaders = {
        ...resolvedEnvHeaders,
        ...customHeaders
      };

      // Detect operation name
      const operationMatch = query.match(/(?:query|mutation|subscription)\s+(\w+)/);
      const operationName = operationMatch ? operationMatch[1] : undefined;

      // Mock response for demo (since we don't have a real GraphQL server)
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

      // Generate mock response based on query
      const mockResponse = generateMockResponse(query, parsedVariables);
      
      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));
      setResponse(mockResponse);

      // Add to history
      addToHistory({
        id: Date.now(),
        requestId: activeRequest.id,
        requestName: activeRequest.name,
        query,
        variables: parsedVariables,
        response: mockResponse,
        responseTime: Math.round(endTime - startTime),
        timestamp: new Date().toISOString(),
        environment: environments.active,
        success: !mockResponse.errors
      });

      if (mockResponse.errors) {
        toast.error('GraphQL Error', { description: mockResponse.errors[0].message });
      } else {
        toast.success('Query executed successfully', { 
          description: `Response time: ${Math.round(endTime - startTime)}ms` 
        });
      }

    } catch (error) {
      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));
      setResponse({
        errors: [{ message: error.message }]
      });
      toast.error('Execution failed', { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockResponse = (query, variables) => {
    // Simple mock data generator based on query content
    if (query.includes('GetUser') || query.includes('user(')) {
      return {
        data: {
          user: {
            id: variables.id || '1',
            name: 'John Doe',
            email: 'john@example.com',
            age: 30,
            createdAt: new Date().toISOString(),
            orders: query.includes('orders') ? [
              { id: 'order-1', total: 99.99, status: 'DELIVERED' },
              { id: 'order-2', total: 149.50, status: 'PROCESSING' }
            ] : undefined
          }
        }
      };
    }

    if (query.includes('ListUsers') || query.includes('users(')) {
      return {
        data: {
          users: [
            { id: '1', name: 'John Doe', email: 'john@example.com', age: 30 },
            { id: '2', name: 'Jane Smith', email: 'jane@example.com', age: 28 },
            { id: '3', name: 'Bob Wilson', email: 'bob@example.com', age: 35 }
          ]
        }
      };
    }

    if (query.includes('CreateOrder') || query.includes('createOrder')) {
      return {
        data: {
          createOrder: {
            id: `order-${Date.now()}`,
            userId: variables.input?.userId || '1',
            items: variables.input?.items || [],
            total: (variables.input?.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0),
            status: 'PENDING',
            createdAt: new Date().toISOString()
          }
        }
      };
    }

    if (query.includes('UpdateOrder') || query.includes('updateOrder')) {
      return {
        data: {
          updateOrder: {
            id: variables.id,
            status: variables.status,
            updatedAt: new Date().toISOString()
          }
        }
      };
    }

    if (query.includes('GetProducts') || query.includes('products(')) {
      return {
        data: {
          products: [
            { id: 'prod-1', name: 'Laptop Pro', price: 1299.99, category: 'Electronics', inStock: true },
            { id: 'prod-2', name: 'Wireless Mouse', price: 49.99, category: 'Electronics', inStock: true },
            { id: 'prod-3', name: 'USB-C Hub', price: 79.99, category: 'Electronics', inStock: false }
          ]
        }
      };
    }

    // Default response
    return {
      data: {
        result: 'Operation executed successfully',
        timestamp: new Date().toISOString()
      }
    };
  };

  const handleSave = () => {
    if (!activeRequest) return;
    
    updateRequest(activeRequest.id, {
      query,
      variables,
      headers: JSON.parse(headers || '{}')
    });
    
    toast.success('Request saved', { description: activeRequest.name });
  };

  const copyAsCurl = () => {
    const resolvedHeaders = {};
    for (const [key, value] of Object.entries(activeEnv.headers || {})) {
      resolvedHeaders[key] = resolveSecrets(value);
    }

    const headersStr = Object.entries(resolvedHeaders)
      .map(([k, v]) => `-H '${k}: ${v}'`)
      .join(' \\\n  ');

    const body = JSON.stringify({
      query,
      variables: JSON.parse(variables || '{}'),
      operationName: query.match(/(?:query|mutation|subscription)\s+(\w+)/)?.[1]
    });

    const curl = `curl -X POST '${activeEnv.endpoint}' \\
  ${headersStr} \\
  -d '${body}'`;

    navigator.clipboard.writeText(curl);
    toast.success('Copied as cURL');
  };

  if (!activeRequest && openTabs.length === 0) {
    return (
      <div className="h-full bg-vscode-editor flex items-center justify-center">
        <div className="text-center space-y-4 animate-fade-in">
          <FileCode size={64} className="mx-auto text-muted-foreground/30" />
          <div>
            <h3 className="text-lg font-medium text-foreground">No request selected</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Select a request from the collections panel or create a new one
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-vscode-editor flex flex-col">
      {/* Tabs bar */}
      <div className="h-9 bg-vscode-titlebar border-b border-border flex items-center overflow-x-auto shrink-0">
        {openTabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveRequest(tab)}
            className={`group flex items-center gap-2 px-3 h-full border-r border-border cursor-pointer transition-colors
              ${activeRequest?.id === tab.id 
                ? 'bg-vscode-editor border-t-2 border-t-primary' 
                : 'bg-vscode-titlebar hover:bg-muted/50'
              }`}
          >
            <FileCode size={14} className={tab.type === 'mutation' ? 'text-accent' : 'text-primary'} />
            <span className="text-xs whitespace-nowrap">{tab.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {activeRequest && (
        <>
          {/* Toolbar */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-3 shrink-0">
            {/* Environment selector */}
            <Select value={environments.active} onValueChange={switchEnvironment}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(environments.envs).map(([key, env]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full 
                        ${key === 'dev' ? 'bg-success' : key === 'staging' ? 'bg-warning' : 'bg-destructive'}`} 
                      />
                      {env.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Endpoint */}
            <div className="flex-1 text-xs text-muted-foreground truncate font-mono">
              {activeEnv.endpoint}
            </div>

            {/* Action buttons */}
            <Button
              onClick={executeQuery}
              disabled={isLoading}
              className="h-8 px-4 bg-primary hover:bg-primary/90"
              size="sm"
            >
              {isLoading ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Play size={14} className="mr-1" fill="currentColor" />
              )}
              Run Query
            </Button>
            
            <Button variant="outline" size="sm" className="h-8" onClick={handleSave}>
              <Save size={14} className="mr-1" />
              Save
            </Button>
            
            <Button variant="outline" size="sm" className="h-8" onClick={copyAsCurl}>
              <Copy size={14} className="mr-1" />
              cURL
            </Button>
          </div>

          {/* Editor and Response panels */}
          <div className="flex-1 flex min-h-0">
            {/* Left panel - Query/Variables/Headers */}
            <div className="w-1/2 flex flex-col border-r border-border min-h-0">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-9 p-0">
                  <TabsTrigger 
                    value="query" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                  >
                    Query
                  </TabsTrigger>
                  <TabsTrigger 
                    value="variables"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                  >
                    Variables
                  </TabsTrigger>
                  <TabsTrigger 
                    value="headers"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                  >
                    Headers
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="query" className="flex-1 mt-0 min-h-0">
                  <GraphQLEditor
                    value={query}
                    onChange={setQuery}
                    language="graphql"
                  />
                </TabsContent>
                
                <TabsContent value="variables" className="flex-1 mt-0 min-h-0">
                  <GraphQLEditor
                    value={variables}
                    onChange={setVariables}
                    language="json"
                  />
                </TabsContent>
                
                <TabsContent value="headers" className="flex-1 mt-0 min-h-0">
                  <GraphQLEditor
                    value={headers}
                    onChange={setHeaders}
                    language="json"
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* Right panel - Response/History */}
            <div className="w-1/2 flex flex-col min-h-0">
              <Tabs value={responseTab} onValueChange={setResponseTab} className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center border-b border-border">
                  <TabsList className="flex-1 justify-start rounded-none bg-transparent h-9 p-0">
                    <TabsTrigger 
                      value="response"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                    >
                      Response
                    </TabsTrigger>
                    <TabsTrigger 
                      value="history"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                    >
                      <History size={14} className="mr-1" />
                      History
                    </TabsTrigger>
                  </TabsList>
                  
                  {responseTime && (
                    <div className="px-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock size={12} />
                      {responseTime}ms
                      {response?.errors ? (
                        <Badge variant="destructive" className="text-xs h-5">Error</Badge>
                      ) : response?.data ? (
                        <Badge variant="outline" className="text-xs h-5 border-success text-success">Success</Badge>
                      ) : null}
                    </div>
                  )}
                </div>
                
                <TabsContent value="response" className="flex-1 mt-0 min-h-0">
                  <ResponseViewer 
                    response={response} 
                    isLoading={isLoading}
                  />
                </TabsContent>
                
                <TabsContent value="history" className="flex-1 mt-0 min-h-0">
                  <HistoryPanel history={history} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const HistoryPanel = ({ history }) => {
  const { setActiveRequest, collections } = useGraphQL();

  if (history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <History size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No history yet</p>
          <p className="text-xs">Execute a query to see history</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-1">
        {history.map((entry) => (
          <button
            key={entry.id}
            className="w-full p-2 rounded hover:bg-muted/50 text-left transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">{entry.requestName}</span>
              <div className="flex items-center gap-2">
                {entry.success ? (
                  <CheckCircle2 size={12} className="text-success" />
                ) : (
                  <AlertCircle size={12} className="text-destructive" />
                )}
                <span className="text-xs text-muted-foreground">{entry.responseTime}ms</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {entry.environment}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
};

export default EditorPanel;
