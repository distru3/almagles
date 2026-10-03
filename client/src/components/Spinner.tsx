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
      className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent"
      role="status"
      aria-label="جارٍ التحميل"
    />
  );
}