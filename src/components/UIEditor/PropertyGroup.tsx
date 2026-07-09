export function PropertyGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ui-property-group">
      <div className="ui-property-group-title">{title}</div>
      <div className="ui-property-group-body">{children}</div>
    </section>
  );
}
