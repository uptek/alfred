import { useEffect, useState } from 'preact/hooks';
import { getTheme } from './utils';
import Theme from './Theme';
import Settings from './Settings';
import type { StoreInfo } from './types';
import '@/assets/tailwind.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('theme');
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const tabs = [
    {
      handle: 'theme',
      name: 'Theme',
    },
    {
      handle: 'settings',
      name: 'Settings',
    },
  ];

  useEffect(() => {
    const fetchStoreInfo = async () => {
      const storeData = await getTheme();
      setStoreInfo(storeData);
      setLoading(false);
    };

    fetchStoreInfo();
  }, []);

  if (loading) {
    return (
      <div className="bg-white min-h-[200px] p-4">
        <div className="flex items-center justify-center gap-3 min-h-[200px]">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
          <span className="text-slate-500 text-sm">Detecting theme...</span>
        </div>
      </div>
    );
  }

  if (!storeInfo?.isShopify) {
    return (
      <div className="bg-white max-w-[400px] min-h-[200px] p-4 m-auto">
        <div className="flex flex-col items-center justify-center min-h-[200px] px-15">
          <h3 className="text-base font-semibold text-slate-900 mb-2">
            Not a Shopify store
          </h3>
          <p className="text-sm text-slate-500 leading-relaxed text-center">
            Navigate to a Shopify store to see Alfred's magic ✨
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-[200px] p-4">
      <div className="flex bg-black/5 p-1 rounded-lg gap-1">
        {tabs.map((tab) => (
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
          <Theme storeInfo={storeInfo} />
        ) : activeTab === 'settings' ? (
          <Settings storeInfo={storeInfo} />
        ) : null}
      </div>
    </div>
  );
}
