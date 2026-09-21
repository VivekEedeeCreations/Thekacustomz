/**
 * A value a variant sets itself, or the parent product's when it leaves it blank. The parent's
 * value is muted so it's clear it's a fallback.
 */
export function InheritedValue({
  own,
  inherited,
}: {
  own: string | null;
  inherited: string | null;
}) {
  if (own != null) return <>{own}</>;
  if (inherited == null) return <>—</>;
  return (
    <span className="text-muted-foreground" title="From the parent product">
      {inherited}
    </span>
  );
}
