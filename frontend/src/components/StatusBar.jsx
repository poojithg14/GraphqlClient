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
  Columns,
  AlertTriangle
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
      toast.success('Schema refreshed');
    }, 1500);
  };

  const handleSetSecret = () => {
    if (!secretKey.trim() || !secretValue.trim()) return;
    setSecret(secretKey, secretValue);
    toast.success(`Secret "${secretKey}" saved`);
    setSecretKey('');
    setSecretValue('');
    setIsSecretDialogOpen(false);
  };

  return (
    <>
      <div className="h-[22px] bg-vscode-statusbar flex items-center justify-between text-[11px] text-white/90 shrink-0">
        {/* Left section */}
        <div className="flex items-center h-full">
          {/* Remote indicator */}
          <button className="h-full px-2 hover:bg-white/10 flex items-center gap-1 transition-colors">
            <Columns size={12} />
          </button>

          {/* Git branch */}
          <button className="h-full px-2 hover:bg-white/10 flex items-center gap-1.5 transition-colors">
            <GitBranch size={12} />
            <span>main</span>
          </button>

          {/* Sync */}
          <button className="h-full px-2 hover:bg-white/10 flex items-center gap-1 transition-colors">
            <RefreshCw size={11} />
          </button>

          {/* Problems */}
          <button className="h-full px-2 hover:bg-white/10 flex items-center gap-1 transition-colors">
            <AlertCircle size={12} />
            <span>0</span>
            <AlertTriangle size={12} />
            <span>0</span>
          </button>
        </div>

        {/* Right section */}
        <div className="flex items-center h-full">
          {/* Collections count */}
          <button className="h-full px-2 hover:bg-white/10 flex items-center gap-1.5 transition-colors">
            <Database size={12} />
            <span>{collections.length} Collections · {totalRequests} Requests</span>
          </button>

          {/* Environment selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-full px-2 hover:bg-white/10 flex items-center gap-1.5 transition-colors">
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
            className="h-full px-2 hover:bg-white/10 flex items-center gap-1.5 transition-colors"
          >
            {schemaLoaded ? (
              <>
                <CheckCircle2 size={12} className="text-green-400" />
                <span>Schema</span>
              </>
            ) : (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>Loading...</span>
              </>
            )}
          </button>

          {/* Set Secret */}
          <button 
            onClick={() => setIsSecretDialogOpen(true)}
            className="h-full px-2 hover:bg-white/10 flex items-center gap-1 transition-colors"
          >
            <Key size={12} />
          </button>

          {/* Notifications */}
          <button className="h-full px-2 hover:bg-white/10 flex items-center transition-colors">
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
              <div className="text-xs text-muted-foreground p-2 bg-muted rounded font-mono">
                Usage: ${'{'}secret:{secretKey}{'}'}
              </div>
            )}
            {Object.keys(secrets).length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium mb-1">Stored secrets:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(secrets).map(key => (
                    <Badge key={key} variant="secondary" className="text-xs font-mono">{key}</Badge>
                  ))}
                </div>
              </div>
            )}
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
