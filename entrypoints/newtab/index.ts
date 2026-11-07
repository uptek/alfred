import { mount } from 'svelte';
import { getItem } from '~/utils/storage';
import App from './App.svelte';
import type { Stored } from './feed';
import './newtab.css';

const load = <K extends keyof Stored>(key: K) => getItem<Stored[K]>('newtab:' + key).catch(() => null);

// The theme reads in under a millisecond and the cached feed in about 20, and Chrome paints a blank frame in
// between. Setting the theme first gives that frame the right background.
const theme = load('theme');
void theme.then((t) => {
  if (t && t !== 'system') document.documentElement.dataset.theme = t;
});

// Mount once everything is read, so the first paint with content already has the last fetched feed.
void Promise.all([theme, load('sidebar'), load('saved'), load('feed')]).then(([theme, sidebar, saved, feed]) =>
  mount(App, { target: document.getElementById('app')!, props: { stored: { theme, sidebar, saved, feed } } })
);
