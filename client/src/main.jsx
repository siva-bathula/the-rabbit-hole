import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './firebase.js';
import { prefetchRhTurnstileSession } from './lib/turnstileSession.js';
import App from './App.jsx';

prefetchRhTurnstileSession();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
