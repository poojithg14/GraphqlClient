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
  Sun,
  User
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
    { id: 'runner', icon: Play, label: 'Run and Debug' },
    { id: 'extensions', icon: Box, label: 'Extensions' },
  ];

  const bottomIcons = [
    { id: 'account', icon: User, label: 'Accounts' },
    { id: 'settings', icon: Settings, label: 'Manage' },
  ];

  const IconButton = ({ item, isActive, isBottom = false }) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => !isBottom && setActiveView(item.id)}
            className={`w-full flex items-center justify-center py-2.5 transition-all duration-100 relative
              ${isActive 
                ? 'text-foreground before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-foreground' 
                : 'text-muted-foreground/70 hover:text-muted-foreground'
              }`}
          >
            <item.icon size={22} strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs font-normal">
          {item.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="w-12 bg-vscode-activitybar flex flex-col items-center h-full">
      {/* Main icons */}
      <div className="flex-1 w-full pt-1">
        {mainIcons.map(item => (
          <IconButton key={item.id} item={item} isActive={activeView === item.id} />
        ))}
      </div>
      
      {/* Bottom icons */}
      <div className="w-full pb-1">
        {/* Theme toggle */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-center py-2.5 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                {theme === 'dark' ? <Sun size={22} strokeWidth={1.5} /> : <Moon size={22} strokeWidth={1.5} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-normal">
              Toggle Theme ({theme === 'dark' ? 'Light' : 'Dark'})
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {bottomIcons.map(item => (
          <IconButton key={item.id} item={item} isActive={false} isBottom />
        ))}
      </div>
    </div>
  );
};

export default ActivityBar;
