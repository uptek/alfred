import { mount } from 'svelte';
import App from './App.svelte';
import './stores/theme.svelte';
import './styles/table.css';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    mount(App, { target: root });
  }
});
