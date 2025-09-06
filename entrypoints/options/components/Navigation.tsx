interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  url?: string;
}

export function Navigation({ currentPage, onNavigate }: NavigationProps) {
  const navItems: NavItem[] = [
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'changelog', label: 'Changelog', icon: 'clock' },
    { id: 'feedback', label: 'Feedback & Requests', icon: 'lightbulb', url: 'https://alfred.featurebase.app/' },
  ];

  return (
    <s-box id="nav">
      <s-section padding="none">
        <s-box background="strong" paddingBlock="large-100" paddingInline="large-100">
          <s-stack direction="inline" alignItems="center" gap="small-200">
            <img src="https://bucket.alfred.uptek.com/logo-settings.png" alt="Alfred logo" style="width: 22px; height: 22px; border-radius: 4px;" />
            <s-heading>Alfred for Shopify</s-heading>
          </s-stack>
        </s-box>
        <s-divider color="strong"></s-divider>
        <nav aria-label="Shop settings menu">
          <ul>
            {navItems.map(item => (
              <li key={item.id}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    className="nav-link"
                  >
                    <s-icon type={item.icon as any}></s-icon>
                    <span>{item.label}</span>
                    <s-icon type="external"></s-icon>
                  </a>
                ) : (
                  <a
                    type="button"
                    data-page={item.id}
                    className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(item.id);
                    }}
                  >
                    <s-icon type={item.icon as any}></s-icon>
                    <span>{item.label}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </s-section>
    </s-box>
  );
}
