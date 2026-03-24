import { useEffect, useState } from 'preact/hooks';
import { trackAction, isReviewDismissed, dismissReview } from '@/utils/analytics';
import InsightsCard from './InsightsCard';
import type { InfoItemProps, StoreInfo } from './types';

function withUtm(url: string, content: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'alfred');
    u.searchParams.set('utm_medium', 'browser_extension');
    u.searchParams.set('utm_campaign', 'theme_detector');
    u.searchParams.set('utm_content', content);
    return u.toString();
  } catch {
    return url;
  }
}

function CopyIcon({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <svg
      className={`w-5 h-5 p-0.5 shrink-0 self-center cursor-pointer text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors ${copied ? 'text-green-600' : ''} ${className}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Click to copy'}>
      {copied ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      )}
    </svg>
  );
}

function InfoItem({ label, value, type = 'text', isLast = false, copyable = false }: InfoItemProps) {
  const getValueClassName = () => {
    switch (type) {
      case 'url':
        return 'text-xs text-indigo-500 font-mono';
      case 'text':
      default:
        return 'text-sm text-slate-900 font-medium';
    }
  };

  return (
    <div className={`flex justify-between items-center py-3.5 ${!isLast ? 'border-b border-slate-100' : ''}`}>
      <label className="text-sm font-semibold text-slate-500">{label}</label>
      <span className={`flex items-center gap-1.5 max-w-[50%] text-right select-text ${getValueClassName()}`}>
        <span className="overflow-x-auto whitespace-nowrap scrollbar-none">{value}</span>
        {copyable && value && <CopyIcon text={value} />}
      </span>
    </div>
  );
}

function getThemePreviewUrl(storeInfo: StoreInfo, disablePreviewBar: boolean): string {
  if (!storeInfo.theme?.id || !storeInfo.page_url) return '';

  const url = new URL(storeInfo.page_url);
  url.searchParams.set('preview_theme_id', storeInfo.theme.id.toString());

  if (disablePreviewBar) {
    url.searchParams.set('pb', '0');
  }

  return url.toString();
}

async function copyThemePreviewUrl(storeInfo: StoreInfo, disablePreviewBar: boolean): Promise<boolean> {
  const url = getThemePreviewUrl(storeInfo, disablePreviewBar);
  if (!url) return false;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export default function Theme({ storeInfo }: { storeInfo: StoreInfo }) {
  const [copying, setCopying] = useState(false);
  const [disablePreviewBar, setDisablePreviewBar] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(true);

  useEffect(() => {
    trackAction('detect_theme', {
      is_shopify: storeInfo.isShopify,
      page_url: storeInfo.page_url ?? '',
      shop_domain: storeInfo.shopDomain ?? '',
      theme_name: storeInfo.theme?.schema_name ?? storeInfo.theme?.name ?? '',
      theme_version: storeInfo.theme?.schema_version ?? ''
    });

    isReviewDismissed().then((dismissed) => {
      setReviewDismissed(dismissed);
      if (!dismissed) trackAction('review_nudge_shown');
    });
  }, [storeInfo]);

  const themeName = storeInfo.theme?.schema_name ?? storeInfo.theme?.name ?? 'Unknown';
  const themeStoreUrl = storeInfo.themeStoreEntry?.theme_url;
  const developer = storeInfo.themeStoreEntry?.developer.name;
  const price = storeInfo.themeStoreEntry
    ? storeInfo.themeStoreEntry.price === '0.00' || !storeInfo.themeStoreEntry.price
      ? 'Free'
      : `$${storeInfo.themeStoreEntry.price}`
    : null;

  return (
    <div className="flex flex-col mt-3">
      {/* Header */}
      <div className="bg-slate-50 rounded-lg p-4 mb-3 text-center">
        <div className="flex items-center justify-center gap-1.5">
          {themeStoreUrl ? (
            <a
              href={withUtm(themeStoreUrl, 'theme_name')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-lg font-bold text-slate-900 underline decoration-2 decoration-slate-300 hover:decoration-slate-500"
              title="Open theme store listing">
              {themeName}
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          ) : (
            <span className="text-lg font-bold text-slate-900">{themeName}</span>
          )}
        </div>
        {storeInfo.shopDomain && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <a
              href={withUtm(`https://${storeInfo.shopDomain}`, 'store_url')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-500 font-mono hover:text-indigo-600">
              {storeInfo.shopDomain}
            </a>
            <CopyIcon text={storeInfo.shopDomain} />
          </div>
        )}
        <p className="text-xs text-slate-500 mt-1">
          {storeInfo.themeStoreEntry ? (
            <>
              {developer && (
                <>
                  by{' '}
                  {storeInfo.themeStoreEntry.developer.url ? (
                    <a
                      href={withUtm(
                        storeInfo.themeStoreEntry.developer.url.startsWith('/')
                          ? `https://themes.shopify.com${storeInfo.themeStoreEntry.developer.url}`
                          : storeInfo.themeStoreEntry.developer.url,
                        'developer'
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 underline decoration-slate-300 hover:decoration-slate-500">
                      {developer}
                    </a>
                  ) : (
                    developer
                  )}
                </>
              )}
              {developer && (price || storeInfo.theme?.schema_version) && <> · </>}
              {price}
              {price && storeInfo.theme?.schema_version && <> · </>}
              {storeInfo.theme?.schema_version && <>v{storeInfo.theme.schema_version}</>}
            </>
          ) : (
            <>
              {storeInfo.theme?.schema_version && <>v{storeInfo.theme.schema_version} · </>}
              (Not listed on Shopify)
            </>
          )}
        </p>
      </div>

      {/* Details */}
      <InfoItem label="Theme ID:" value={storeInfo.theme?.id?.toString() ?? 'N/A'} copyable />
      {storeInfo.theme?.name &&
        (!storeInfo.theme?.schema_name || storeInfo.theme.name !== storeInfo.theme.schema_name) && (
          <InfoItem label="Theme name (internal):" value={storeInfo.theme.name} copyable />
        )}
      {storeInfo.themeStoreEntry && (
        <InfoItem label="Latest version available:" value={storeInfo.themeStoreEntry.version || 'N/A'} />
      )}
      <div className="py-3.5 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-slate-500">Preview URL:</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={disablePreviewBar}
              onChange={(e) => setDisablePreviewBar(e.currentTarget.checked)}
              className="w-4 h-4 text-indigo-500 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            />
            <span className="text-xs text-slate-600">Disable preview bar</span>
          </label>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={getThemePreviewUrl(storeInfo, disablePreviewBar)}
            readOnly
            className="flex-1 px-3 py-2 text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 select-all"
            placeholder={storeInfo.theme?.id ? 'Generating preview URL...' : 'Theme ID not available'}
          />
          <button
            onClick={async () => {
              setCopying(true);
              const success = await copyThemePreviewUrl(storeInfo, disablePreviewBar);
              setTimeout(() => setCopying(false), success ? 1500 : 0);
            }}
            disabled={copying || !storeInfo.theme?.id}
            className={`w-[110px] py-2 rounded-lg font-semibold text-sm transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
              copying ? 'bg-green-500 text-white' : 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}>
            <span>{copying ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {!reviewDismissed && (
        <InsightsCard
          onDismiss={async () => {
            await dismissReview();
            trackAction('review_nudge_dismissed');
            setReviewDismissed(true);
          }}
          onReviewClick={async () => {
            await dismissReview();
            trackAction('review_nudge_clicked');
            setReviewDismissed(true);
          }}
        />
      )}
    </div>
  );
}
