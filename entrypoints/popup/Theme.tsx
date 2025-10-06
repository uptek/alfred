import { useEffect, useState } from 'preact/hooks';
import { trackAction } from '@/utils/analytics';
import type { InfoItemProps, StoreInfo } from './types';

function InfoItem({
  label,
  value,
  type = 'text',
  isLast = false,
}: InfoItemProps) {
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
    <div
      className={`flex justify-between items-center py-3.5 ${!isLast ? 'border-b border-slate-100' : ''}`}
    >
      <label className="text-sm font-semibold text-slate-500">{label}</label>
      <span
        className={`max-w-[60%] break-all text-right select-text ${getValueClassName()}`}
      >
        {value}
      </span>
    </div>
  );
}

function getThemePreviewUrl(
  storeInfo: StoreInfo,
  disablePreviewBar: boolean
): string {
  if (!storeInfo.theme?.id || !storeInfo.page_url) return '';

  const url = new URL(storeInfo.page_url);
  url.searchParams.set('preview_theme_id', storeInfo.theme.id.toString());

  if (disablePreviewBar) {
    url.searchParams.set('pb', '0');
  }

  return url.toString();
}

async function copyThemePreviewUrl(
  storeInfo: StoreInfo,
  disablePreviewBar: boolean
): Promise<boolean> {
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

  useEffect(() => {
    trackAction('detect_theme', {
      is_shopify: storeInfo.isShopify,
      page_url: storeInfo.page_url || '',
      shop_domain: storeInfo.shopDomain || '',
      theme_name: storeInfo.theme?.schema_name || storeInfo.theme?.name || '',
      theme_version: storeInfo.theme?.schema_version || '',
    });
  }, [storeInfo]);

  return (
    <div className="flex flex-col">
      <InfoItem
        label="Shopify URL:"
        value={storeInfo.shopDomain || 'N/A'}
        type="url"
      />
      <InfoItem
        label="Theme name:"
        value={storeInfo.theme?.schema_name || storeInfo.theme?.name || 'N/A'}
      />
      <InfoItem
        label="Theme version:"
        value={storeInfo.theme?.schema_version || 'N/A'}
      />
      <div className="py-3.5 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-slate-500">
            Preview URL:
          </label>
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
            placeholder={
              storeInfo.theme?.id
                ? 'Generating preview URL...'
                : 'Theme ID not available'
            }
          />
          <button
            onClick={async () => {
              setCopying(true);
              const success = await copyThemePreviewUrl(
                storeInfo,
                disablePreviewBar
              );
              setTimeout(() => setCopying(false), success ? 1500 : 0);
            }}
            disabled={copying || !storeInfo.theme?.id}
            className={`w-[110px] py-2 rounded-lg font-semibold text-sm transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
              copying
                ? 'bg-green-500 text-white'
                : 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {copying ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              )}
            </svg>
            <span>{copying ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
