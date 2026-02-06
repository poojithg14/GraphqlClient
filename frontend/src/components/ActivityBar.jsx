import React, { useState } from 'react';
import { 
  Database, 
  Search, 
  GitBranch, 
  Settings, 
  Play,
  Box,
  Layers,
  Moon,
  Sun
} from 'lucide-react';
import { useTheme } from '../App';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const ActivityBar = ({ activeView, setActiveView }) => {
  const { theme, toggleTheme } = useTheme();

  const mainIcons = [
    { id: 'explorer', icon: Layers, label: 'Explorer' },
    { id: 'graphql', icon: Database, label: 'GraphQL Collections' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'git', icon: GitBranch, label: 'Source Control' },
    { id: 'runner', icon: Play, label: 'GraphQL Runner' },
    { id: 'extensions', icon: Box, label: 'Extensions' },
  ];

  const bottomIcons = [
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const IconButton = ({ item, isActive }) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setActiveView(item.id)}
            className={`w-full flex items-center justify-center py-3 transition-all duration-150 relative
              ${isActive 
                ? 'text-foreground before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-foreground' 
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            <item.icon size={24} strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {item.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="w-12 bg-vscode-activitybar flex flex-col items-center border-r border-border h-full">
      {/* Main icons */}
      <div className="flex-1 w-full">
        {mainIcons.map(item => (
          <IconButton key={item.id} item={item} isActive={activeView === item.id} />
        ))}
      </div>
      
      {/* Bottom icons */}
      <div className="w-full border-t border-border/50">
        {/* Theme toggle */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-center py-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                {theme === 'dark' ? <Sun size={22} strokeWidth={1.5} /> : <Moon size={22} strokeWidth={1.5} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Toggle Theme
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {bottomIcons.map(item => (
          <IconButton key={item.id} item={item} isActive={activeView === item.id} />
        ))}
      </div>
    </div>
  );
};

export default ActivityBar;
