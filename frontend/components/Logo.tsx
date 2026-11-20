export default function Logo({ size = 28, text = true }: { size?: number; text?: boolean }) {
  const width = Math.round(size * 1.22);
  return (
    <span className="inline-flex items-center gap-2.5 select-none group">
      <img
        src="/logo-emblem.png"
        alt="PakkaDeal"
        width={width}
        height={size}
        className="shrink-0 object-contain transition-transform group-hover:scale-105"
        style={{ height: `${size}px`, width: "auto" }}
      />
      {text && (
        <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Pakka<span className="text-emerald-600 dark:text-emerald-500">Deal</span>
        </span>
      )}
    </span>
  );
}

