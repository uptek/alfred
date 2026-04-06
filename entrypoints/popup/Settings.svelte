<script lang="ts">
  import type { StoreInfo } from './types';
  import StorefrontPassword from './settings/StorefrontPassword.svelte';

  let { storeInfo }: { storeInfo: StoreInfo } = $props();
</script>

<div class="flex flex-col">
  <StorefrontPassword {storeInfo} />
</div>
