export function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  return <span className="status-pill" data-status={status}>{label}</span>;
}
