import React, { useState } from 'react';
import { 
  Database, 
  GitBranch, 
  CheckCircle2, 
  AlertCircle,
  Bell,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronUp,
  Key,
  Columns
} from 'lucide-react';
import { useGraphQL, useTheme } from '../App';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import { Input } from './ui/input';
import { toast } from 'sonner';

const StatusBar = ({ onToggleSidebar }) => {
  const { 
    environments, 
    switchEnvironment, 
    schemaLoaded,
    setSchemaLoaded,
    collections,
    setSecret,
    secrets
  } = useGraphQL();
  
  const { theme } = useTheme();
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');

  const activeEnv = environments.envs[environments.active];
  
  const totalRequests = collections.reduce(
    (sum, col) => sum + col.folders.reduce((fSum, f) => fSum + f.requests.length, 0),
    0
  );

  const handleRefreshSchema = () => {
    setSchemaLoaded(false);
    setTimeout(() => {
      setSchemaLoaded(true);
      toast.success('Schema refreshed successfully');
    }, 1500);
  };

  const handleSetSecret = () => {
    if (!secretKey.trim() || !secretValue.trim()) return;
    setSecret(secretKey, secretValue);
    toast.success(`Secret "${secretKey}" saved securely`);
    setSecretKey('');
    setSecretValue('');
    setIsSecretDialogOpen(false);
  };

  const getEnvBadgeClass = () => {
    switch (environments.active) {
      case 'dev': return 'env-dev';
      case 'staging': return 'env-staging';
      case 'prod': return 'env-prod';
      default: return '';
    }
  };

  return (
    <>
      <div className="h-6 bg-vscode-statusbar flex items-center justify-between px-2 text-xs text-primary-foreground shrink-0">
        {/* Left section */}
        <div className="flex items-center gap-1">
          {/* Sidebar toggle */}
          <button 
            onClick={onToggleSidebar}
            className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors flex items-center gap-1"
          >
            <Columns size={12} />
          </button>

          {/* Git branch */}
          <button className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors flex items-center gap-1">
            <GitBranch size={12} />
            <span>main</span>
          </button>

          {/* Sync status */}
          <button className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors flex items-center gap-1">
            <RefreshCw size={12} />
            <span>Sync</span>
          </button>
        </div>

        {/* Center section */}
        <div className="flex items-center gap-2">
          {/* GraphQL Runner label */}
          <div className="flex items-center gap-1.5 px-2">
            <Database size={12} />
            <span className="font-medium">GraphQL Runner</span>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-1">
          {/* Collections count */}
          <button className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors flex items-center gap-1">
            <span>📁 {collections.length} Collections</span>
            <span className="text-white/60">•</span>
            <span>{totalRequests} Requests</span>
          </button>

          {/* Environment selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full 
                  ${environments.active === 'dev' ? 'bg-green-400' : 
                    environments.active === 'staging' ? 'bg-yellow-400' : 'bg-red-400'}`} 
                />
                <span>{activeEnv.name}</span>
                <ChevronUp size={10} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {Object.entries(environments.envs).map(([key, env]) => (
                <DropdownMenuItem 
                  key={key}
                  onClick={() => switchEnvironment(key)}
                  className="flex items-center gap-2"
                >
                  <div className={`w-2 h-2 rounded-full 
                    ${key === 'dev' ? 'bg-success' : key === 'staging' ? 'bg-warning' : 'bg-destructive'}`} 
                  />
                  <span className="flex-1">{env.name}</span>
                  {environments.active === key && <CheckCircle2 size={14} />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings size={12} className="mr-2" />
                Edit Environments
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Schema status */}
          <button 
            onClick={handleRefreshSchema}
            className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors flex items-center gap-1.5"
          >
            {schemaLoaded ? (
              <>
                <CheckCircle2 size={12} className="text-green-400" />
                <span>Schema: Loaded</span>
              </>
            ) : (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>Loading Schema...</span>
              </>
            )}
          </button>

          {/* Set Secret */}
          <button 
            onClick={() => setIsSecretDialogOpen(true)}
            className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors flex items-center gap-1"
          >
            <Key size={12} />
          </button>

          {/* Notifications */}
          <button className="px-2 py-0.5 hover:bg-white/10 rounded transition-colors">
            <Bell size={12} />
          </button>
        </div>
      </div>

      {/* Set Secret Dialog */}
      <Dialog open={isSecretDialogOpen} onOpenChange={setIsSecretDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key size={18} />
              Set Secret
            </DialogTitle>
            <DialogDescription>
              Store a secret value securely. Use ${'{'}secret:KEY{'}'} in headers to reference it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Secret Key</label>
              <Input
                placeholder="e.g., DEV_TOKEN"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase().replace(/\s/g, '_'))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Secret Value</label>
              <Input
                type="password"
                placeholder="Enter secret value"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
              />
            </div>
            {secretKey && (
              <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                Usage: <code className="text-primary">${'{'}secret:{secretKey}{'}'}</code>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Currently stored secrets:</p>
              <div className="flex flex-wrap gap-1">
                {Object.keys(secrets).map(key => (
                  <Badge key={key} variant="secondary" className="text-xs">{key}</Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSecretDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetSecret} disabled={!secretKey.trim() || !secretValue.trim()}>
              Save Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatusBar;
