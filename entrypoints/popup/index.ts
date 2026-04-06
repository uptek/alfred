import { mount } from 'svelte';
import App from './App.svelte';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    mount(App, { target: root });
  }
});
