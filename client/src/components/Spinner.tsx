export default function Spinner({ full = false }: { full?: boolean }) {
  if (full) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SpinnerIcon />
      </div>
    );
  }
  return <SpinnerIcon />;
}

function SpinnerIcon() {
  return (
    <span
      className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-700"
      role="status"
      aria-label="جارٍ التحميل"
    />
  );
}