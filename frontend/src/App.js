import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import VSCodeLayout from './components/VSCodeLayout';
import { Toaster } from './components/ui/sonner';

// Theme Context
const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

// GraphQL Context for global state
const GraphQLContext = createContext();

export const useGraphQL = () => useContext(GraphQLContext);

// Empty initial state - no demo data
const initialCollections = [];

const initialEnvironments = {
  active: 'dev',
  envs: {
    dev: {
      name: 'Development',
      endpoint: 'http://localhost:4000/graphql',
      headers: {
        'Authorization': 'Bearer ${secret:DEV_TOKEN}',
        'Content-Type': 'application/json'
      }
    },
    staging: {
      name: 'Staging',
      endpoint: 'https://staging-api.example.com/graphql',
      headers: {
        'Authorization': 'Bearer ${secret:STAGING_TOKEN}',
        'Content-Type': 'application/json'
      }
    },
    prod: {
      name: 'Production',
      endpoint: 'https://api.example.com/graphql',
      headers: {
        'Authorization': 'Bearer ${secret:PROD_TOKEN}',
        'Content-Type': 'application/json',
        'x-api-key': '${env:API_KEY}'
      }
    }
  }
};

// Empty secrets - user must add their own
const initialSecrets = {};

function App() {
  const [theme, setTheme] = useState('dark');
  const [collections, setCollections] = useState(initialCollections);
  const [environments, setEnvironments] = useState(initialEnvironments);
  const [secrets, setSecrets] = useState(initialSecrets);
  const [activeRequest, setActiveRequest] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [schemaLoaded, setSchemaLoaded] = useState(true);
  const [history, setHistory] = useState([]);

  // Auto-detect system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mediaQuery.matches ? 'dark' : 'light');

    const handler = (e) => setTheme(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Apply theme class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const openRequest = (request) => {
    setActiveRequest(request);
    if (!openTabs.find(tab => tab.id === request.id)) {
      setOpenTabs(prev => [...prev, request]);
    }
  };

  const closeTab = (requestId) => {
    setOpenTabs(prev => prev.filter(tab => tab.id !== requestId));
    if (activeRequest?.id === requestId) {
      const remaining = openTabs.filter(tab => tab.id !== requestId);
      setActiveRequest(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  };

  const updateRequest = (requestId, updates) => {
    setCollections(prev => prev.map(col => ({
      ...col,
      folders: col.folders.map(folder => ({
        ...folder,
        requests: folder.requests.map(req =>
          req.id === requestId ? { ...req, ...updates } : req
        )
      }))
    })));
    
    setOpenTabs(prev => prev.map(tab =>
      tab.id === requestId ? { ...tab, ...updates } : tab
    ));
    
    if (activeRequest?.id === requestId) {
      setActiveRequest(prev => ({ ...prev, ...updates }));
    }
  };

  const addToHistory = (entry) => {
    setHistory(prev => [entry, ...prev.slice(0, 49)]);
  };

  const resolveSecrets = (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/\$\{secret:([^}]+)\}/g, (_, key) => secrets[key] || '');
  };

  const setSecret = (key, value) => {
    setSecrets(prev => ({ ...prev, [key]: value }));
  };

  const switchEnvironment = (envKey) => {
    setEnvironments(prev => ({ ...prev, active: envKey }));
  };

  const graphqlValue = {
    collections,
    setCollections,
    environments,
    setEnvironments,
    secrets,
    setSecret,
    activeRequest,
    setActiveRequest,
    openTabs,
    setOpenTabs,
    openRequest,
    closeTab,
    updateRequest,
    schemaLoaded,
    setSchemaLoaded,
    history,
    addToHistory,
    resolveSecrets,
    switchEnvironment
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <GraphQLContext.Provider value={graphqlValue}>
        <Router>
          <Routes>
            <Route path="/*" element={<VSCodeLayout />} />
          </Routes>
          <Toaster position="bottom-right" richColors />
        </Router>
      </GraphQLContext.Provider>
    </ThemeContext.Provider>
  );
}

export default App;
