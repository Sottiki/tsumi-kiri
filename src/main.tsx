import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import './ui/base.css';
import { App } from './ui/App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つからない');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
