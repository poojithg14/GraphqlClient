import React, { useState } from 'react';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import EditorPanel from './EditorPanel';
import StatusBar from './StatusBar';

const VSCodeLayout = () => {
  const [activeView, setActiveView] = useState('graphql');
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const handleResize = (e) => {
    const newWidth = e.clientX - 48; // subtract activity bar width
    if (newWidth >= 200 && newWidth <= 500) {
      setSidebarWidth(newWidth);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Title bar */}
      <div className="h-8 bg-vscode-titlebar border-b border-border flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/80 hover:bg-destructive transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-warning/80 hover:bg-warning transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-success/80 hover:bg-success transition-colors cursor-pointer" />
          </div>
        </div>
        <div className="flex-1 text-center text-xs text-muted-foreground font-medium">
          GraphQL Collections & Runner - Visual Studio Code
        </div>
        <div className="w-16" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar activeView={activeView} setActiveView={setActiveView} />

        {/* Sidebar */}
        {isSidebarVisible && (
          <>
            <div style={{ width: sidebarWidth }} className="shrink-0">
              <Sidebar activeView={activeView} />
            </div>
            
            {/* Resize handle */}
            <div
              className="w-1 bg-border hover:bg-primary cursor-col-resize transition-colors shrink-0"
              onMouseDown={(e) => {
                e.preventDefault();
                const handleMouseMove = (e) => handleResize(e);
                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
          </>
        )}

        {/* Editor Panel */}
        <div className="flex-1 min-w-0">
          <EditorPanel />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar onToggleSidebar={() => setIsSidebarVisible(prev => !prev)} />
    </div>
  );
};

export default VSCodeLayout;
