import { describe, expect, it } from 'bun:test';
import { ANALYTICS_ACTIONS } from '../analytics-actions';
import { LEGACY_ACTIONS } from '../analytics-legacy';

// The closed lists behind `<surface>.<feature>.<object>_<verb>` (AGENTS.md,
// "Event naming"). A new surface or verb is added here first.
const SURFACES = ['popup', 'storefront', 'admin', 'dev', 'apps', 'options', 'system'];
const VERBS = [
  'view',
  'open',
  'click',
  'copy',
  'export',
  'share',
  'sort',
  'filter',
  'search',
  'toggle',
  'expand',
  'collapse',
  'locate',
  'highlight',
  'add',
  'remove',
  'update',
  'clear',
  'apply',
  'save',
  'submit',
  'request',
  'detect',
  'resize',
  'show',
  'dismiss',
  'switch',
  'inspect',
  'calculate',
  'check',
  'autofill',
  'exit',
  'disable',
  'ping',
  'uninstall'
];
const NAME = new RegExp(`^(${SURFACES.join('|')})\\.[a-z]+(_[a-z]+)*\\.([a-z]+_)*(${VERBS.join('|')})$`);

describe('analytics action names', () => {
  it('follow <surface>.<feature>.<object>_<verb>', () => {
    expect(ANALYTICS_ACTIONS.filter((action) => !NAME.test(action))).toEqual([]);
  });

  it('upgrade legacy names to names that follow the pattern', () => {
    const targets = Object.values(LEGACY_ACTIONS).flatMap((rules) => rules.map((rule) => rule.to));
    expect(targets.filter((action) => !NAME.test(action))).toEqual([]);
  });

  it('never reuse a legacy name as a current one', () => {
    const current = new Set<string>(ANALYTICS_ACTIONS);
    expect(Object.keys(LEGACY_ACTIONS).filter((name) => current.has(name))).toEqual([]);
  });

  it('reject names that break the pattern', () => {
    for (const name of [
      'links_export',
      'popup.links_export',
      'popup.links.exported',
      'web.links.export',
      'popup.Links.export'
    ]) {
      expect(NAME.test(name)).toBe(false);
    }
  });
});
