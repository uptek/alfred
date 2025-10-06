import { useState, useEffect } from 'preact/hooks';
import { Navigation } from './components/Navigation';
import { Settings, Changelog } from './components/pages';
import { SettingsProvider } from './contexts/SettingsContext';

export default function App() {
  const [currentPage, setCurrentPage] = useState('settings');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');

    if (page && ['settings', 'changelog'].includes(page)) {
      setCurrentPage(page);
    }

    const handlePopState = (event: PopStateEvent) => {
      const page = ((event.state as { page?: string } | null)?.page) ?? 'settings';
      setCurrentPage(page);
    };

    window.addEventListener('popstate', handlePopState);

    const initializePolaris = async () => {
      try {
        await customElements.whenDefined('s-page');
        setTimeout(() => setIsLoading(false), 100);
      } catch (error) {
        console.error('Failed to initialize Polaris:', error);
        setIsLoading(false);
      }
    };

    initializePolaris();

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleNavigation = (page: string) => {
    setCurrentPage(page);
    history.pushState({ page }, '', `?page=${page}`);
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <div className="loading-text">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <SettingsProvider>
      <s-page>
        <s-box paddingBlock="large-500">
          <s-grid gridTemplateColumns="18rem 1fr" gap="base">
            <Navigation
              currentPage={currentPage}
              onNavigate={handleNavigation}
            />
            <s-box>
              {currentPage === 'settings' && <Settings />}
              {currentPage === 'changelog' && <Changelog />}
            </s-box>
          </s-grid>
        </s-box>
      </s-page>
    </SettingsProvider>
  );
}
