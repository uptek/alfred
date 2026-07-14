import { mount } from 'svelte';
import App from './App.svelte';
import './stores/theme.svelte';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    mount(App, { target: root });
  }
});
