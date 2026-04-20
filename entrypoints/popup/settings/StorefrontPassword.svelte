<script lang="ts">
  import { getPasswordEntry, savePassword, deletePassword, setPasswordEnabled } from '@/utils/storefrontPasswords';
  import type { StoreInfo } from '../types';

  let { storeInfo }: { storeInfo: StoreInfo } = $props();

  let domain = $state<string | null>(null);
  let password = $state('');
  let autoFillPassword = $state(true);
  let showPassword = $state(false);
  let loading = $state(true);
  let saving = $state(false);

  $effect(() => {
    const loadCurrentStore = async () => {
      loading = true;
      if (storeInfo?.domain) {
        domain = storeInfo.domain;
        const entry = await getPasswordEntry(storeInfo.domain);
        if (entry) {
          password = entry.password;
          autoFillPassword = entry.enabled;
        }
      }
      loading = false;
    };
    loadCurrentStore();
  });

  async function handleSavePassword() {
    if (!domain) return;
    saving = true;
    try {
      if (password.trim()) {
        await savePassword(domain, password.trim());
      } else {
        await deletePassword(domain);
      }
      setTimeout(() => (saving = false), 1500);
    } catch (error) {
      console.error('Failed to save password:', error);
      saving = false;
    }
  }

  async function handleAutoFillPasswordChange(checked: boolean) {
    autoFillPassword = checked;
    if (!domain) return;
    await setPasswordEnabled(domain, checked);
  }
</script>

{#if loading}
  <div class="flex items-center justify-center py-8">
    <div class="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
  </div>
{:else if !domain}
  <div class="py-3.5">
    <div class="text-center py-8">
      <p class="text-sm text-slate-500">Unable to detect current store domain</p>
    </div>
  </div>
{:else}
  <div class="py-3.5 border-t border-slate-100">
    <div class="flex items-center justify-between mb-3">
      <label for="storefrontPassword" class="text-sm font-semibold text-slate-500 cursor-pointer">
        Storefront password:
      </label>
      <label for="autoFillPassword" class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          id="autoFillPassword"
          checked={autoFillPassword}
          onchange={(e) => handleAutoFillPasswordChange(e.currentTarget.checked)}
          class="w-4 h-4 text-indigo-500 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
        />
        <span class="text-xs text-slate-600">Auto-fill password?</span>
      </label>
    </div>
    <div class="relative flex gap-2">
      <div class="relative flex-1">
        <input
          id="storefrontPassword"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          placeholder="Enter password"
          disabled={!autoFillPassword}
          class="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
        />
        <button
          id="togglePassword"
          type="button"
          onclick={() => (showPassword = !showPassword)}
          disabled={!autoFillPassword}
          class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={showPassword ? 'Hide password' : 'Show password'}>
          {#if showPassword}
            <svg class="w-4 h-4" viewBox="0 0 20 20">
              <path d="M11.977 4.751a7.598 7.598 0 0 0-1.977-.251c-2.444 0-4.196 1.045-5.325 2.233a7.188 7.188 0 0 0-1.243 1.773c-.26.532-.432 1.076-.432 1.494 0 .418.171.962.432 1.493.172.354.4.734.687 1.116l1.074-1.074a5.388 5.388 0 0 1-.414-.7c-.221-.453-.279-.753-.279-.835 0-.082.058-.382.279-.835a5.71 5.71 0 0 1 .983-1.398c.89-.937 2.264-1.767 4.238-1.767.24 0 .471.012.693.036l1.284-1.285Z" />
              <path fill-rule="evenodd" d="M4.25 14.6a.75.75 0 0 0 1.067 1.053l1.062-1.061c.975.543 2.177.908 3.621.908 2.45 0 4.142-1.05 5.24-2.242 1.078-1.17 1.588-2.476 1.738-3.076a.749.749 0 0 0 0-.364c-.15-.6-.66-1.906-1.738-3.076a7.245 7.245 0 0 0-.51-.502l.923-.923a.75.75 0 0 0-1.053-1.068l-.008.008-10.335 10.336-.008.007Zm5.75-.6c-.978 0-1.809-.204-2.506-.523l1.108-1.109a2.75 2.75 0 0 0 3.766-3.766l1.3-1.299c.169.147.325.3.469.455a6.387 6.387 0 0 1 1.332 2.242 6.387 6.387 0 0 1-1.332 2.242c-.86.933-2.17 1.758-4.137 1.758Zm0-2.75c-.087 0-.172-.01-.254-.026l1.478-1.478a1.25 1.25 0 0 1-1.224 1.504Z" />
            </svg>
          {:else}
            <svg class="w-4 h-4" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-1.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
              <path fill-rule="evenodd" d="M10 4c-2.476 0-4.348 1.23-5.577 2.532a9.266 9.266 0 0 0-1.4 1.922 5.98 5.98 0 0 0-.37.818c-.082.227-.153.488-.153.728s.071.501.152.728c.088.246.213.524.371.818.317.587.784 1.27 1.4 1.922 1.229 1.302 3.1 2.532 5.577 2.532 2.476 0 4.348-1.23 5.577-2.532a9.265 9.265 0 0 0 1.4-1.922 5.98 5.98 0 0 0 .37-.818c.082-.227.153-.488.153-.728s-.071-.501-.152-.728a5.984 5.984 0 0 0-.371-.818 9.269 9.269 0 0 0-1.4-1.922c-1.229-1.302-3.1-2.532-5.577-2.532Zm-5.999 6.002v-.004c.004-.02.017-.09.064-.223a4.5 4.5 0 0 1 .278-.608 7.768 7.768 0 0 1 1.17-1.605c1.042-1.104 2.545-2.062 4.487-2.062 1.942 0 3.445.958 4.486 2.062a7.77 7.77 0 0 1 1.17 1.605c.13.24.221.447.279.608.047.132.06.203.064.223v.004c-.004.02-.017.09-.064.223a4.503 4.503 0 0 1-.278.608 7.768 7.768 0 0 1-1.17 1.605c-1.042 1.104-2.545 2.062-4.487 2.062-1.942 0-3.445-.958-4.486-2.062a7.766 7.766 0 0 1-1.17-1.605 4.5 4.5 0 0 1-.279-.608c-.047-.132-.06-.203-.064-.223Z" />
            </svg>
          {/if}
        </button>
      </div>
      <button
        onclick={handleSavePassword}
        disabled={saving || !autoFillPassword}
        class="w-[110px] py-2 rounded-lg font-semibold text-sm transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer {saving ? 'bg-green-500 text-white' : 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700'} disabled:opacity-50 disabled:cursor-not-allowed">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {#if saving}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          {/if}
        </svg>
        <span>{saving ? 'Saved' : 'Save'}</span>
      </button>
      {#if !autoFillPassword}
        <div class="absolute inset-0 bg-white/50 backdrop-blur-[0.5px] rounded-lg pointer-events-none"></div>
      {/if}
    </div>
  </div>
{/if}
