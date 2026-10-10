import { describe, expect, it } from 'bun:test';
import { upgradeLegacyEvent } from '../analytics-legacy';

describe('upgradeLegacyEvent', () => {
  it('renames a legacy action and keeps its metadata', () => {
    expect(upgradeLegacyEvent('popup_open', { is_shopify: true })).toEqual({
      action: 'popup.app.open',
      metadata: { is_shopify: true }
    });
  });

  it.each([
    ['cartograph', 'storefront.cartograph.credit_click'],
    ['timeline', 'admin.timeline.credit_click'],
    ['collaborator_access', 'dev.collaborator_access.credit_click'],
    ['partner_table', 'apps.partner_table.credit_click'],
    ['compare', 'apps.compare.credit_click'],
    ['options', 'options.review_request.credit_click']
  ])('names a credit click from %s after the component that hosted it', (source, action) => {
    expect(upgradeLegacyEvent('credit_click', { source })?.action).toBe(action);
  });

  it('tells the review modal (which sends a variant) from the ambient star prompt', () => {
    expect(upgradeLegacyEvent('credit_click', { source: 'review_nudge', rating: 5, variant: 2 })?.action).toBe(
      'popup.review_nudge.credit_click'
    );
    expect(upgradeLegacyEvent('credit_click', { source: 'review_nudge', rating: 5 })?.action).toBe(
      'popup.review_prompt.credit_click'
    );
    expect(upgradeLegacyEvent('review_nudge_show', { variant: 0 })?.action).toBe('popup.review_nudge.show');
    expect(upgradeLegacyEvent('review_nudge_show', {})?.action).toBe('popup.review_prompt.show');
  });

  it('moves invocation from source to trigger', () => {
    expect(upgradeLegacyEvent('copy_theme_preview_url', { source: 'popup', shop_domain: 'a.myshopify.com' })).toEqual({
      action: 'storefront.shortcuts.preview_url_copy',
      metadata: { trigger: 'popup', shop_domain: 'a.myshopify.com' }
    });
    expect(upgradeLegacyEvent('apply_preset', { source: 'url_param', auto_submit: true })?.metadata).toEqual({
      trigger: 'url_param',
      auto_submit: true
    });
  });

  it('calls a manual preset apply a button trigger', () => {
    expect(upgradeLegacyEvent('apply_preset', { source: 'manual', permissions_count: 3 })?.metadata).toEqual({
      trigger: 'button',
      permissions_count: 3
    });
  });

  it('leaves metadata alone when a renamed key is absent', () => {
    expect(upgradeLegacyEvent('apply_preset', { permissions_count: 3 })).toEqual({
      action: 'dev.collaborator_access.preset_apply',
      metadata: { permissions_count: 3 }
    });
  });

  it('folds export formats into one action with a format property', () => {
    expect(upgradeLegacyEvent('compare_export_csv', { app_count: 4 })).toEqual({
      action: 'apps.compare.export',
      metadata: { app_count: 4, format: 'csv' }
    });
  });

  it('passes metadata that is not a plain object through untouched', () => {
    expect(upgradeLegacyEvent('compare_export_csv', 'oops')).toEqual({
      action: 'apps.compare.export',
      metadata: 'oops'
    });
    expect(upgradeLegacyEvent('popup_open', undefined)).toEqual({ action: 'popup.app.open', metadata: undefined });
  });

  it('returns null for names it does not know and for events no rule matches', () => {
    expect(upgradeLegacyEvent('made_up_action', {})).toBeNull();
    expect(upgradeLegacyEvent('credit_click', { source: 'somewhere_new' })).toBeNull();
    expect(upgradeLegacyEvent('credit_click', {})).toBeNull();
    expect(upgradeLegacyEvent('constructor', {})).toBeNull();
    expect(upgradeLegacyEvent('__proto__', {})).toBeNull();
  });
});
