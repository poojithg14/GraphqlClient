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

// Initial mock data
const initialCollections = [
  {
    id: 'col-1',
    name: 'My API Collection',
    folders: [
      {
        id: 'folder-1',
        name: 'User Queries',
        requests: [
          {
            id: 'req-1',
            name: 'Get User',
            type: 'query',
            query: `query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    age
    createdAt
  }
}`,
            variables: '{\n  "id": "1"\n}',
            headers: {}
          },
          {
            id: 'req-2',
            name: 'User Details',
            type: 'query',
            query: `query UserDetails($id: ID!) {
  user(id: $id) {
    id
    name
    email
    age
    orders {
      id
      total
      status
    }
  }
}`,
            variables: '{\n  "id": "1"\n}',
            headers: {}
          },
          {
            id: 'req-3',
            name: 'List Users',
            type: 'query',
            query: `query ListUsers($limit: Int, $offset: Int) {
  users(limit: $limit, offset: $offset) {
    id
    name
    email
    age
  }
}`,
            variables: '{\n  "limit": 10,\n  "offset": 0\n}',
            headers: {}
          }
        ]
      },
      {
        id: 'folder-2',
        name: 'Order Mutations',
        requests: [
          {
            id: 'req-4',
            name: 'Create Order',
            type: 'mutation',
            query: `mutation CreateOrder($input: OrderInput!) {
  createOrder(input: $input) {
    id
    userId
    items {
      productId
      quantity
      price
    }
    total
    status
    createdAt
  }
}`,
            variables: '{\n  "input": {\n    "userId": "1",\n    "items": [\n      {\n        "productId": "prod-1",\n        "quantity": 2,\n        "price": 29.99\n      }\n    ]\n  }\n}',
            headers: {}
          },
          {
            id: 'req-5',
            name: 'Update Order',
            type: 'mutation',
            query: `mutation UpdateOrder($id: ID!, $status: OrderStatus!) {
  updateOrder(id: $id, status: $status) {
    id
    status
    updatedAt
  }
}`,
            variables: '{\n  "id": "order-1",\n  "status": "SHIPPED"\n}',
            headers: {}
          }
        ]
      }
    ]
  },
  {
    id: 'col-2',
    name: 'Shared with Team',
    folders: [
      {
        id: 'folder-3',
        name: 'Product Queries',
        requests: [
          {
            id: 'req-6',
            name: 'Get Products',
            type: 'query',
            query: `query GetProducts($category: String) {
  products(category: $category) {
    id
    name
    price
    category
    inStock
  }
}`,
            variables: '{\n  "category": "Electronics"\n}',
            headers: {}
          }
        ]
      }
    ]
  }
];

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

const initialSecrets = {
  DEV_TOKEN: 'dev-secret-token-12345',
  STAGING_TOKEN: 'staging-secret-token-67890',
  PROD_TOKEN: 'prod-secret-token-abcdef'
};

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
