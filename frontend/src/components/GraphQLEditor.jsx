import React, { useRef, useEffect, useState } from 'react';
import { ScrollArea } from './ui/scroll-area';

const GraphQLEditor = ({ value, onChange, language = 'graphql', readOnly = false }) => {
  const textareaRef = useRef(null);
  const [lineCount, setLineCount] = useState(1);

  useEffect(() => {
    const lines = (value || '').split('\n').length;
    setLineCount(Math.max(lines, 20));
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      
      // Restore cursor position
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const highlightSyntax = (code, lang) => {
    if (!code) return [];
    
    const lines = code.split('\n');
    
    return lines.map((line, idx) => {
      if (lang === 'graphql') {
        return highlightGraphQL(line);
      } else if (lang === 'json') {
        return highlightJSON(line);
      }
      return <span key={idx}>{line}</span>;
    });
  };

  const highlightGraphQL = (line) => {
    // Simple regex-based highlighting
    const patterns = [
      { regex: /(#.*)$/, className: 'text-syntax-comment' },
      { regex: /\b(query|mutation|subscription|fragment|on|type|enum|input|interface|union|scalar|directive|extend|schema|implements)\b/g, className: 'text-syntax-keyword font-medium' },
      { regex: /\b(ID|String|Int|Float|Boolean|true|false|null)\b/g, className: 'text-syntax-type' },
      { regex: /(\$\w+)/g, className: 'text-syntax-variable' },
      { regex: /(@\w+)/g, className: 'text-accent' },
      { regex: /("(?:[^"\\]|\\.)*")/g, className: 'text-syntax-string' },
      { regex: /\b(\d+(?:\.\d+)?)\b/g, className: 'text-syntax-number' },
      { regex: /(\w+)(?=\s*\()/g, className: 'text-syntax-function' },
      { regex: /(\w+)(?=\s*:)/g, className: 'text-foreground' },
    ];

    let result = line;
    let segments = [{ text: line, className: '' }];

    patterns.forEach(({ regex, className }) => {
      segments = segments.flatMap(segment => {
        if (segment.className) return [segment];
        
        const parts = [];
        let lastIndex = 0;
        let match;
        
        const re = new RegExp(regex.source, regex.flags);
        while ((match = re.exec(segment.text)) !== null) {
          if (match.index > lastIndex) {
            parts.push({ text: segment.text.slice(lastIndex, match.index), className: '' });
          }
          parts.push({ text: match[0], className });
          lastIndex = re.lastIndex;
        }
        
        if (lastIndex < segment.text.length) {
          parts.push({ text: segment.text.slice(lastIndex), className: '' });
        }
        
        return parts.length > 0 ? parts : [segment];
      });
    });

    return (
      <>
        {segments.map((seg, i) => (
          <span key={i} className={seg.className}>{seg.text}</span>
        ))}
      </>
    );
  };

  const highlightJSON = (line) => {
    const patterns = [
      { regex: /("(?:[^"\\]|\\.)*")(?=\s*:)/g, className: 'text-syntax-variable' },
      { regex: /:\s*("(?:[^"\\]|\\.)*")/g, className: 'text-syntax-string', group: 1 },
      { regex: /:\s*(\d+(?:\.\d+)?)/g, className: 'text-syntax-number', group: 1 },
      { regex: /:\s*(true|false|null)/g, className: 'text-syntax-keyword', group: 1 },
    ];

    let segments = [{ text: line, className: '' }];

    patterns.forEach(({ regex, className }) => {
      segments = segments.flatMap(segment => {
        if (segment.className) return [segment];
        
        const parts = [];
        let lastIndex = 0;
        let match;
        
        const re = new RegExp(regex.source, regex.flags);
        while ((match = re.exec(segment.text)) !== null) {
          const matchText = match[0];
          if (match.index > lastIndex) {
            parts.push({ text: segment.text.slice(lastIndex, match.index), className: '' });
          }
          parts.push({ text: matchText, className });
          lastIndex = re.lastIndex;
        }
        
        if (lastIndex < segment.text.length) {
          parts.push({ text: segment.text.slice(lastIndex), className: '' });
        }
        
        return parts.length > 0 ? parts : [segment];
      });
    });

    return (
      <>
        {segments.map((seg, i) => (
          <span key={i} className={seg.className}>{seg.text}</span>
        ))}
      </>
    );
  };

  const highlightedLines = highlightSyntax(value, language);

  return (
    <div className="h-full relative font-mono text-[13px] leading-6">
      <ScrollArea className="h-full">
        <div className="flex min-h-full">
          {/* Line numbers */}
          <div className="shrink-0 w-12 bg-muted/30 text-right pr-3 pl-2 pt-2 select-none border-r border-border">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="text-muted-foreground text-xs leading-6">
                {i + 1}
              </div>
            ))}
          </div>
          
          {/* Code area with overlay */}
          <div className="flex-1 relative min-w-0">
            {/* Syntax highlighted display */}
            <div className="absolute inset-0 p-2 pointer-events-none whitespace-pre-wrap break-all overflow-hidden">
              {highlightedLines.map((line, idx) => (
                <div key={idx} className="leading-6">
                  {line || '\u00A0'}
                </div>
              ))}
            </div>
            
            {/* Textarea for editing */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              spellCheck={false}
              className="absolute inset-0 w-full h-full p-2 bg-transparent text-transparent caret-foreground resize-none outline-none leading-6 whitespace-pre-wrap font-mono text-[13px]"
              style={{ caretColor: 'currentColor' }}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default GraphQLEditor;
