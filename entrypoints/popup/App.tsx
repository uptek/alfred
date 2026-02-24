import { useEffect, useState } from 'preact/hooks';
import { getTheme } from './utils';
import Theme from './Theme';
import Settings from './Settings';
import type { StoreInfo } from './types';
import '@/assets/tailwind.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('theme');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const tabs = [
    {
      handle: 'theme',
      name: 'Theme'
    },
    {
      handle: 'settings',
      name: 'Settings'
    }
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
          <h3 className="text-base font-semibold text-slate-900 mb-2">Not a Shopify store</h3>
          <p className="text-sm text-slate-500 leading-relaxed text-center">
            Navigate to a Shopify store to see Alfred's magic ✨
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-[200px] p-4">
      <div
        className="relative flex p-[3px] bg-[#f7f7f7] border border-[#e3e3e3] rounded-xl"
        onMouseLeave={() => setHoveredTab(null)}>
        <div
          className="absolute inset-[3px] rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] pointer-events-none"
          style={{
            width: `calc((100% - 6px) / ${tabs.length})`,
            transform: `translateX(${tabs.indexOf(tabs.find((t) => t.handle === (hoveredTab ?? activeTab))!) * 100}%)`
          }}
        />
        {tabs.map((tab) => (
          <button
            className={`relative z-10 flex-1 inline-flex items-center justify-center px-6 py-2 text-[13px] leading-snug bg-transparent border-none rounded-[10px] cursor-pointer transition-[color,font-weight] duration-200 ease-out ${
              activeTab === tab.handle ? 'text-slate-900 font-semibold' : 'text-slate-500 font-medium'
            } ${hoveredTab === tab.handle ? 'text-slate-900' : ''}`}
            onClick={() => setActiveTab(tab.handle)}
            onMouseEnter={() => setHoveredTab(tab.handle)}>
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
