import { useEffect, useState } from 'preact/hooks';
import { getTheme } from './utils';
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
  const [activeTab, setActiveTab] = useState<'theme' | 'store'>('theme');

  useEffect(() => {
    const fetchThemeInfo = async () => {
      const themeData = await getTheme();
      setThemeInfo(themeData);
      setLoading(false);
    };

    fetchThemeInfo();
  }, []);

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
            <button
              className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                activeTab === 'theme'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setActiveTab('theme')}
            >
              Theme
            </button>
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
                  value={themeInfo.theme?.name || 'N/A'}
                />
                <InfoItem
                  label="Theme version:"
                  value={themeInfo.theme?.schema_version || 'N/A'}
                  isLast={true}
                />
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
