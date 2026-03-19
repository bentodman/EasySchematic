export default function AdminErrorBanner({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div className="px-4 py-2 bg-red-50 text-red-700 text-xs flex items-center justify-between">
      <span>{error}</span>
      <button onClick={onDismiss} className="text-red-500 hover:underline" type="button">
        Dismiss
      </button>
    </div>
  );
}

