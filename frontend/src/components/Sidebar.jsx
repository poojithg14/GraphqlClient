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
  Search,
  Database,
  FolderPlus
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
  
  const [expandedCollections, setExpandedCollections] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewRequestDialogOpen, setIsNewRequestDialogOpen] = useState(false);
  const [isNewCollectionDialogOpen, setIsNewCollectionDialogOpen] = useState(false);
  const [newRequestName, setNewRequestName] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
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
      query: 'text-syntax-variable',
      mutation: 'text-accent',
      subscription: 'text-success'
    };
    return <FileCode size={14} className={colors[type] || 'text-muted-foreground'} />;
  };

  const handleExport = () => {
    if (collections.length === 0) {
      toast.error('No collections to export');
      return;
    }
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
            if (Array.isArray(imported)) {
              setCollections(prev => [...prev, ...imported]);
              // Auto expand imported collections
              setExpandedCollections(prev => [...prev, ...imported.map(c => c.id)]);
              toast.success(`Imported ${imported.length} collection(s)`);
            } else {
              toast.error('Invalid collection format');
            }
          } catch (err) {
            toast.error('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    
    const newCollection = {
      id: `col-${Date.now()}`,
      name: newCollectionName,
      folders: newFolderName.trim() ? [{
        id: `folder-${Date.now()}`,
        name: newFolderName,
        requests: []
      }] : []
    };

    setCollections(prev => [...prev, newCollection]);
    setExpandedCollections(prev => [...prev, newCollection.id]);
    if (newFolderName.trim()) {
      setExpandedFolders(prev => [...prev, newCollection.folders[0].id]);
    }
    
    setNewCollectionName('');
    setNewFolderName('');
    setIsNewCollectionDialogOpen(false);
    toast.success(`Created collection "${newCollectionName}"`);
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

  const allFolders = collections.flatMap(col => col.folders);

  if (activeView !== 'graphql') {
    return (
      <div className="h-full bg-vscode-sidebar flex flex-col">
        <div className="px-4 py-2 border-b border-border">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {activeView === 'explorer' && 'Explorer'}
            {activeView === 'search' && 'Search'}
            {activeView === 'git' && 'Source Control'}
            {activeView === 'runner' && 'GraphQL Runner'}
            {activeView === 'extensions' && 'Extensions'}
            {activeView === 'settings' && 'Settings'}
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground text-center">
            Panel content
          </p>
        </div>
      </div>
    );
  }

  // Empty state when no collections
  if (collections.length === 0) {
    return (
      <div className="h-full bg-vscode-sidebar flex flex-col">
        {/* Header */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            GraphQL Collections
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleImport}>
                <Upload size={14} className="mr-2" />
                Import Collection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <Database size={40} className="text-muted-foreground/30 mb-4" />
          <h3 className="text-sm font-medium text-foreground mb-1">No Collections</h3>
          <p className="text-xs text-muted-foreground text-center mb-4">
            Create a collection to organize your GraphQL requests
          </p>
          <div className="space-y-2 w-full max-w-[200px]">
            <Button 
              onClick={() => setIsNewCollectionDialogOpen(true)} 
              className="w-full h-8 text-xs"
              size="sm"
            >
              <FolderPlus size={14} className="mr-1.5" />
              New Collection
            </Button>
            <Button 
              variant="outline"
              onClick={handleImport} 
              className="w-full h-8 text-xs"
              size="sm"
            >
              <Upload size={14} className="mr-1.5" />
              Import JSON
            </Button>
          </div>
        </div>

        {/* New Collection Dialog */}
        <Dialog open={isNewCollectionDialogOpen} onOpenChange={setIsNewCollectionDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Collection</DialogTitle>
              <DialogDescription>
                Create a new collection to organize your GraphQL requests.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Collection Name</label>
                <Input
                  placeholder="e.g., My API"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">First Folder (optional)</label>
                <Input
                  placeholder="e.g., User Queries"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewCollectionDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCollection} disabled={!newCollectionName.trim()}>
                Create Collection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="h-full bg-vscode-sidebar flex flex-col">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            GraphQL Collections
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5">
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
              <DropdownMenuItem onClick={() => setIsNewCollectionDialogOpen(true)}>
                <FolderPlus size={14} className="mr-2" />
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
            className="h-6 pl-7 text-xs bg-input/50 border-border"
          />
        </div>
      </div>

      {/* Tree View */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {filteredCollections.map(collection => (
            <div key={collection.id} className="mb-0.5">
              {/* Collection Header */}
              <button
                onClick={() => toggleCollection(collection.id)}
                className="w-full flex items-center gap-1 px-2 py-1 hover:bg-muted/50 text-[13px] transition-colors group"
              >
                {expandedCollections.includes(collection.id) 
                  ? <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                  : <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                }
                <span className="text-syntax-variable shrink-0">●</span>
                <span className="truncate font-medium">{collection.name}</span>
              </button>

              {/* Folders */}
              {expandedCollections.includes(collection.id) && (
                <div className="ml-4">
                  {collection.folders.map(folder => (
                    <div key={folder.id}>
                      {/* Folder Header */}
                      <div className="flex items-center group">
                        <button
                          onClick={() => toggleFolder(folder.id)}
                          className="flex-1 flex items-center gap-1 px-2 py-0.5 hover:bg-muted/50 text-[13px] transition-colors"
                        >
                          {expandedFolders.includes(folder.id) 
                            ? <>
                                <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                                <FolderOpen size={14} className="text-warning shrink-0" />
                              </>
                            : <>
                                <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                                <Folder size={14} className="text-warning shrink-0" />
                              </>
                          }
                          <span className="truncate ml-0.5">{folder.name}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
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
                        <div className="ml-5">
                          {folder.requests.map(request => (
                            <button
                              key={request.id}
                              onClick={() => openRequest(request)}
                              className={`w-full flex items-center gap-2 px-2 py-0.5 text-[13px] transition-colors group
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
                          {folder.requests.length === 0 && (
                            <div className="px-2 py-1 text-xs text-muted-foreground italic">
                              No requests
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {collection.folders.length === 0 && (
                    <div className="px-2 py-1 ml-4 text-xs text-muted-foreground italic">
                      No folders
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="p-2 border-t border-border flex gap-2">
        <Button 
          onClick={() => {
            if (allFolders.length > 0) {
              setIsNewRequestDialogOpen(true);
            } else {
              toast.error('Create a collection with a folder first');
            }
          }} 
          className="flex-1 h-7 text-xs"
          size="sm"
        >
          <Plus size={14} className="mr-1" />
          New Request
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleImport}>
          <Upload size={14} />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleExport}>
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
                  {allFolders.map(folder => (
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
            <Button variant="outline" onClick={() => {
              setIsNewRequestDialogOpen(false);
              setSelectedFolder(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateRequest} disabled={!newRequestName.trim() || !selectedFolder}>
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Collection Dialog */}
      <Dialog open={isNewCollectionDialogOpen} onOpenChange={setIsNewCollectionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Create a new collection to organize your GraphQL requests.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Collection Name</label>
              <Input
                placeholder="e.g., My API"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">First Folder (optional)</label>
              <Input
                placeholder="e.g., User Queries"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewCollectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCollection} disabled={!newCollectionName.trim()}>
              Create Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sidebar;
