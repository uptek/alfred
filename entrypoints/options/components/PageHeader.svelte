<script lang="ts">
  let { icon, title }: { icon: string; title: string } = $props();
</script>

<s-stack direction="inline" alignItems="center" gap="small-200">
  <s-icon type={icon}></s-icon>
  <s-heading>{title}</s-heading>
</s-stack>
