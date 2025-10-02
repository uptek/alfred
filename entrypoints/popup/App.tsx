import { useEffect, useState } from 'preact/hooks';
import { getTheme, getThemePreviewUrl, copyThemePreviewUrl } from './utils';
import { trackAction } from '@/utils/analytics';
import { InfoItemProps, ThemeInfo } from './types';
import "@/assets/tailwind.css";

function InfoItem({ label, value, type = 'text', isLast = false }: InfoItemProps) {
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
      <span className={`max-w-[60%] break-all text-right select-text ${getValueClassName()}`}>
        {value}
      </span>
    </div>
  );
}

export default function App() {
  const [themeInfo, setThemeInfo] = useState<ThemeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('theme');
  const [tracked, setTracked] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);
  const [disablePreviewBar, setDisablePreviewBar] = useState(false);
  const tabs = [
    {
      handle: 'theme',
      name: 'Theme',
    }
  ];

  useEffect(() => {
    const fetchThemeInfo = async () => {
      const themeData = await getTheme();
      setThemeInfo(themeData);
      setLoading(false);

      trackAction('detect_theme', {
        is_shopify: themeData?.isShopify,
        page_url: themeData?.page_url || '',
        shop_domain: themeData?.shop || '',
        theme_name: themeData?.theme?.schema_name || themeData?.theme?.name || '',
        theme_version: themeData?.theme?.schema_version || '',
      });
    };

    fetchThemeInfo();
  }, []);

  useEffect(() => {
    if (activeTab === 'theme' && !tracked.includes('theme') && themeInfo) {
      trackAction('detect_theme', {
        is_shopify: themeInfo?.isShopify,
        page_url: themeInfo?.page_url || '',
        shop_domain: themeInfo?.shop || '',
        theme_name: themeInfo?.theme?.schema_name || themeInfo?.theme?.name || '',
        theme_version: themeInfo?.theme?.schema_version || '',
      });
      setTracked([...tracked, 'theme']);
    }
  }, [activeTab]);

  return (
    <div className="bg-white min-h-[200px] p-4">
      {loading ? (
        <div className="flex items-center justify-center gap-3 min-h-[200px]">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
          <span className="text-slate-500 text-sm">Detecting theme...</span>
        </div>
      ) : themeInfo?.isShopify ? (
        <>
          <div className="flex bg-black/5 p-1 rounded-lg gap-1">
            {tabs.map(tab => (
              <button
                className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${activeTab === tab.handle
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                  }`}
                onClick={() => setActiveTab(tab.handle)}
              >
                {tab.name}
              </button>
            ))}
          </div>

          <div>
            {activeTab === 'theme' ? (
              <div className="flex flex-col">
                <InfoItem
                  label="Shopify URL:"
                  value={themeInfo.shop || 'N/A'}
                  type="url"
                />
                <InfoItem
                  label="Theme name:"
                  value={themeInfo.theme?.schema_name || themeInfo.theme?.name || 'N/A'}
                />
                <InfoItem
                  label="Theme version:"
                  value={themeInfo.theme?.schema_version || 'N/A'}
                />
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
                      value={getThemePreviewUrl(themeInfo, disablePreviewBar)}
                      readOnly
                      className="flex-1 px-3 py-2 text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 select-all"
                      placeholder={themeInfo.theme?.id ? 'Generating preview URL...' : 'Theme ID not available'}
                    />
                    <button
                      onClick={async () => {
                        setCopying(true);
                        const success = await copyThemePreviewUrl(themeInfo, disablePreviewBar);
                        setTimeout(() => setCopying(false), success ? 1500 : 0);
                      }}
                      disabled={copying || !themeInfo.theme?.id}
                      className={`w-[110px] py-2 rounded-lg font-semibold text-sm transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
                        copying
                          ? 'bg-green-500 text-white'
                          : 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {copying ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        )}
                      </svg>
                      <span>{copying ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-[150px]">
                <p className="text-sm text-slate-500">Store information coming soon</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[200px] px-15">
          <h3 className="text-base font-semibold text-slate-900 mb-2">Not a Shopify store</h3>
          <p className="text-sm text-slate-500 leading-relaxed text-center">Navigate to a Shopify store to see Alfred's magic ✨</p>
        </div>
      )}
    </div>
  );
}
