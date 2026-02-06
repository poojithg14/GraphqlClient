import React from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Loader2, AlertCircle, FileJson } from 'lucide-react';

const ResponseViewer = ({ response, isLoading }) => {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-vscode-panel">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="mx-auto animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Executing query...</p>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="h-full flex items-center justify-center bg-vscode-panel">
        <div className="text-center space-y-2">
          <FileJson size={48} className="mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Run a query to see results</p>
        </div>
      </div>
    );
  }

  const formatJSON = (obj, indent = 0) => {
    const spaces = '  '.repeat(indent);
    const nextSpaces = '  '.repeat(indent + 1);
    
    if (obj === null) {
      return <span className="text-syntax-keyword">null</span>;
    }
    
    if (typeof obj === 'boolean') {
      return <span className="text-syntax-keyword">{obj.toString()}</span>;
    }
    
    if (typeof obj === 'number') {
      return <span className="text-syntax-number">{obj}</span>;
    }
    
    if (typeof obj === 'string') {
      return <span className="text-syntax-string">"{obj}"</span>;
    }
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return <span>[]</span>;
      }
      
      return (
        <>
          <span>[</span>
          {obj.map((item, i) => (
            <div key={i}>
              <span>{nextSpaces}</span>
              {formatJSON(item, indent + 1)}
              {i < obj.length - 1 && <span>,</span>}
            </div>
          ))}
          <span>{spaces}]</span>
        </>
      );
    }
    
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return <span>{'{}'}</span>;
      }
      
      return (
        <>
          <span>{'{'}</span>
          {keys.map((key, i) => (
            <div key={key}>
              <span>{nextSpaces}</span>
              <span className="text-syntax-variable">"{key}"</span>
              <span>: </span>
              {formatJSON(obj[key], indent + 1)}
              {i < keys.length - 1 && <span>,</span>}
            </div>
          ))}
          <span>{spaces}{'}'}</span>
        </>
      );
    }
    
    return <span>{String(obj)}</span>;
  };

  const hasErrors = response.errors && response.errors.length > 0;

  return (
    <ScrollArea className="h-full bg-vscode-panel">
      <div className="p-4 font-mono text-[13px] leading-6">
        {hasErrors && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
            <div className="flex items-center gap-2 text-destructive font-medium mb-2">
              <AlertCircle size={16} />
              GraphQL Errors
            </div>
            {response.errors.map((error, i) => (
              <div key={i} className="text-sm text-destructive/80">
                {error.message}
                {error.path && (
                  <span className="ml-2 text-xs opacity-70">
                    at {error.path.join('.')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        
        <pre className="whitespace-pre-wrap">
          {formatJSON(response)}
        </pre>
      </div>
    </ScrollArea>
  );
};

export default ResponseViewer;
