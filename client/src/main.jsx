import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import HandHistoryPage from './components/HandHistoryPage.jsx';
import './App.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
if (window.location.pathname === '/hand-history') {
  root.render(<React.StrictMode><HandHistoryPage /></React.StrictMode>);
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
