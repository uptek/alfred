import { render } from 'preact';
import App from './App';
import './options.main.css';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    render(<App />, root);
  }
});