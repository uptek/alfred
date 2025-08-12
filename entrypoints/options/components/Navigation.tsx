interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Navigation({ currentPage, onNavigate }: NavigationProps) {
  const navItems = [
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'changelog', label: 'Changelog', icon: 'clock' },
  ] as const;

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
                <a
                  type="button"
                  data-page={item.id}
                  className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(item.id);
                  }}
                >
                  <s-icon type={item.icon}></s-icon>
                  <span>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </s-section>
    </s-box>
  );
}
