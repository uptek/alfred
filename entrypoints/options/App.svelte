<script lang="ts">
  import Navigation from './components/Navigation.svelte';
  import Settings from './components/pages/Settings.svelte';
  import Changelog from './components/pages/Changelog.svelte';

  let currentPage = $state('settings');
  let isLoading = $state(true);

  $effect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page && ['settings', 'changelog'].includes(page)) {
      currentPage = page;
    }

    const handlePopState = (event: PopStateEvent) => {
      const p = (event.state as { page?: string } | null)?.page ?? 'settings';
      currentPage = p;
    };
    window.addEventListener('popstate', handlePopState);

    const initializePolaris = async () => {
      try {
        await customElements.whenDefined('s-page');
        setTimeout(() => (isLoading = false), 100);
      } catch (error) {
        console.error('Failed to initialize Polaris:', error);
        isLoading = false;
      }
    };
    initializePolaris();

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });

  function handleNavigation(page: string) {
    currentPage = page;
    history.pushState({ page }, '', `?page=${page}`);
  }
</script>

{#if isLoading}
  <div class="loading">
    <div class="loading-spinner">
      <div class="spinner"></div>
      <div class="loading-text">Loading...</div>
    </div>
  </div>
{:else}
  <s-page>
    <s-box paddingBlock="large-500">
      <s-grid gridTemplateColumns="18rem 1fr" gap="base">
        <Navigation {currentPage} onNavigate={handleNavigation} />
        <s-box>
          {#if currentPage === 'settings'}
            <Settings />
          {:else if currentPage === 'changelog'}
            <Changelog />
          {/if}
        </s-box>
      </s-grid>
    </s-box>
  </s-page>
{/if}
