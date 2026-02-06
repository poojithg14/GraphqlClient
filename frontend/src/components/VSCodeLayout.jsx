import React, { useState } from 'react';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import EditorPanel from './EditorPanel';
import StatusBar from './StatusBar';

const VSCodeLayout = () => {
  const [activeView, setActiveView] = useState('graphql');
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const handleResize = (e) => {
    const newWidth = e.clientX - 48; // subtract activity bar width
    if (newWidth >= 180 && newWidth <= 450) {
      setSidebarWidth(newWidth);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-vscode-editor overflow-hidden">
      {/* Title bar - macOS style */}
      <div className="h-[30px] bg-vscode-titlebar border-b border-border flex items-center px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 transition-colors cursor-pointer" />
          </div>
        </div>
        <div className="flex-1 text-center text-[11px] text-muted-foreground font-medium select-none">
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
            <div style={{ width: sidebarWidth }} className="shrink-0 border-r border-border">
              <Sidebar activeView={activeView} />
            </div>
            
            {/* Resize handle */}
            <div
              className="w-[3px] bg-transparent hover:bg-primary cursor-col-resize transition-colors shrink-0"
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
