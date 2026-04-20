<script lang="ts">
  let { currentPage, onNavigate }: { currentPage: string; onNavigate: (page: string) => void } = $props();

  interface NavItem {
    id: string;
    label: string;
    icon: string;
    url?: string;
  }

  const navItems: NavItem[] = [
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'changelog', label: 'Changelog', icon: 'clock' },
    { id: 'feedback', label: 'Feedback & Requests', icon: 'lightbulb', url: 'https://github.com/uptek/alfred/issues' }
  ];
</script>

<s-box id="nav">
  <s-section padding="none">
    <s-box background="strong" paddingBlock="large-100" paddingInline="large-100">
      <s-stack direction="inline" alignItems="center" gap="small-200">
        <img
          src="https://bucket.alfred.uptek.com/logo-settings.png"
          alt="Alfred logo"
          style="width: 22px; height: 22px; border-radius: 4px;"
        />
        <s-heading>Alfred for Shopify</s-heading>
      </s-stack>
    </s-box>
    <s-divider color="strong"></s-divider>
    <nav aria-label="Shop settings menu">
      <ul>
        {#each navItems as item}
          <li>
            {#if item.url}
              <a href={item.url} target="_blank" class="nav-link">
                <s-icon type={item.icon}></s-icon>
                <span>{item.label}</span>
                <s-icon type="external"></s-icon>
              </a>
            {:else}
              <a
                href="#{item.id}"
                data-page={item.id}
                class="nav-link {currentPage === item.id ? 'active' : ''}"
                onclick={(e) => { e.preventDefault(); onNavigate(item.id); }}>
                <s-icon type={item.icon}></s-icon>
                <span>{item.label}</span>
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
  </s-section>
</s-box>
