export function PageHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <s-stack direction="inline" alignItems="center" gap="small-200">
      {/* eslint-disable-next-line */}
      <s-icon type={icon as any}></s-icon>
      <s-heading>{title}</s-heading>
    </s-stack>
  );
}
