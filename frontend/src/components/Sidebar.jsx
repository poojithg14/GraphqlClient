import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  FolderOpen, 
  Folder,
  FileCode,
  Plus,
  MoreHorizontal,
  Upload,
  Download,
  Trash2,
  Edit2,
  Copy,
  Search
} from 'lucide-react';
import { useGraphQL } from '../App';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';

const Sidebar = ({ activeView }) => {
  const { 
    collections, 
    setCollections, 
    openRequest, 
    activeRequest 
  } = useGraphQL();
  
  const [expandedCollections, setExpandedCollections] = useState(['col-1', 'col-2']);
  const [expandedFolders, setExpandedFolders] = useState(['folder-1', 'folder-2', 'folder-3']);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewRequestDialogOpen, setIsNewRequestDialogOpen] = useState(false);
  const [newRequestName, setNewRequestName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);

  const toggleCollection = (colId) => {
    setExpandedCollections(prev => 
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => 
      prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
    );
  };

  const getRequestIcon = (type) => {
    const colors = {
      query: 'text-primary',
      mutation: 'text-accent',
      subscription: 'text-success'
    };
    return <FileCode size={14} className={colors[type] || 'text-muted-foreground'} />;
  };

  const handleExport = () => {
    const data = JSON.stringify(collections, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graphql-collections.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Collections exported successfully');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target.result);
            setCollections(prev => [...prev, ...imported]);
            toast.success('Collections imported successfully');
          } catch (err) {
            toast.error('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleCreateRequest = () => {
    if (!newRequestName.trim() || !selectedFolder) return;
    
    const newRequest = {
      id: `req-${Date.now()}`,
      name: newRequestName,
      type: 'query',
      query: `query ${newRequestName.replace(/\s+/g, '')} {\n  # Write your query here\n}`,
      variables: '{}',
      headers: {}
    };

    setCollections(prev => prev.map(col => ({
      ...col,
      folders: col.folders.map(folder => 
        folder.id === selectedFolder.id 
          ? { ...folder, requests: [...folder.requests, newRequest] }
          : folder
      )
    })));

    setNewRequestName('');
    setSelectedFolder(null);
    setIsNewRequestDialogOpen(false);
    openRequest(newRequest);
    toast.success(`Created "${newRequestName}"`);
  };

  const filteredCollections = searchQuery 
    ? collections.map(col => ({
        ...col,
        folders: col.folders.map(folder => ({
          ...folder,
          requests: folder.requests.filter(req => 
            req.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
        })).filter(folder => folder.requests.length > 0)
      })).filter(col => col.folders.length > 0)
    : collections;

  if (activeView !== 'graphql') {
    return (
      <div className="h-full bg-vscode-sidebar border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {activeView === 'explorer' && 'Explorer'}
            {activeView === 'search' && 'Search'}
            {activeView === 'git' && 'Source Control'}
            {activeView === 'runner' && 'GraphQL Runner'}
            {activeView === 'extensions' && 'Extensions'}
            {activeView === 'settings' && 'Settings'}
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            {activeView === 'graphql' ? 'Select a collection to get started' : `${activeView} panel content`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-vscode-sidebar border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            GraphQL Collections
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleImport}>
                <Upload size={14} className="mr-2" />
                Import Collection
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download size={14} className="mr-2" />
                Export All Collections
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Plus size={14} className="mr-2" />
                New Collection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-xs bg-background/50"
          />
        </div>
      </div>

      {/* Tree View */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredCollections.map(collection => (
            <div key={collection.id} className="mb-1">
              {/* Collection Header */}
              <button
                onClick={() => toggleCollection(collection.id)}
                className="w-full flex items-center gap-1 px-2 py-1.5 rounded hover:bg-muted/50 text-sm font-medium transition-colors"
              >
                {expandedCollections.includes(collection.id) 
                  ? <ChevronDown size={14} className="text-muted-foreground" />
                  : <ChevronRight size={14} className="text-muted-foreground" />
                }
                <span className="text-primary">●</span>
                <span className="truncate">{collection.name}</span>
              </button>

              {/* Folders */}
              {expandedCollections.includes(collection.id) && (
                <div className="ml-3 border-l border-border/50 pl-2">
                  {collection.folders.map(folder => (
                    <div key={folder.id} className="mb-0.5">
                      {/* Folder Header */}
                      <div className="flex items-center group">
                        <button
                          onClick={() => toggleFolder(folder.id)}
                          className="flex-1 flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 text-sm transition-colors"
                        >
                          {expandedFolders.includes(folder.id) 
                            ? <>
                                <ChevronDown size={12} className="text-muted-foreground" />
                                <FolderOpen size={14} className="text-warning" />
                              </>
                            : <>
                                <ChevronRight size={12} className="text-muted-foreground" />
                                <Folder size={14} className="text-warning" />
                              </>
                          }
                          <span className="truncate ml-1">{folder.name}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setSelectedFolder(folder);
                            setIsNewRequestDialogOpen(true);
                          }}
                        >
                          <Plus size={12} />
                        </Button>
                      </div>

                      {/* Requests */}
                      {expandedFolders.includes(folder.id) && (
                        <div className="ml-4">
                          {folder.requests.map(request => (
                            <button
                              key={request.id}
                              onClick={() => openRequest(request)}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors group
                                ${activeRequest?.id === request.id 
                                  ? 'bg-primary/15 text-foreground' 
                                  : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                                }`}
                            >
                              {getRequestIcon(request.type)}
                              <span className="truncate">{request.name}</span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal size={12} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem>
                                    <Edit2 size={12} className="mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Copy size={12} className="mr-2" />
                                    Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive focus:text-destructive">
                                    <Trash2 size={12} className="mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-border flex gap-2">
        <Button 
          onClick={() => setIsNewRequestDialogOpen(true)} 
          className="flex-1 h-8 text-xs"
          size="sm"
        >
          <Plus size={14} className="mr-1" />
          New Request
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleImport}>
          <Upload size={14} />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleExport}>
          <Download size={14} />
        </Button>
      </div>

      {/* New Request Dialog */}
      <Dialog open={isNewRequestDialogOpen} onOpenChange={setIsNewRequestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Request</DialogTitle>
            <DialogDescription>
              Add a new GraphQL request to your collection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Request Name</label>
              <Input
                placeholder="e.g., Get User Details"
                value={newRequestName}
                onChange={(e) => setNewRequestName(e.target.value)}
              />
            </div>
            {!selectedFolder && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Folder</label>
                <div className="space-y-1 max-h-40 overflow-auto border rounded-md p-2">
                  {collections.flatMap(col => col.folders).map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => setSelectedFolder(folder)}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors
                        ${selectedFolder?.id === folder.id ? 'bg-primary/15' : 'hover:bg-muted'}`}
                    >
                      <Folder size={14} className="text-warning" />
                      {folder.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedFolder && (
              <div className="text-sm text-muted-foreground">
                Folder: <span className="text-foreground font-medium">{selectedFolder.name}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewRequestDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRequest} disabled={!newRequestName.trim() || !selectedFolder}>
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sidebar;
