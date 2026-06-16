<script lang="ts">
  import type { StoreInfo } from './utils/types';
  import StorefrontPassword from './settings/StorefrontPassword.svelte';

  let { storeInfo }: { storeInfo: StoreInfo } = $props();
</script>

<div class="settings-wrapper">
  <StorefrontPassword {storeInfo} />
</div>

<style>
  .settings-wrapper {
    display: flex;
    flex-direction: column;
  }
</style>
