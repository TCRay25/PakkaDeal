export default function Logo({ size = 26, text = true }: { size?: number; text?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
        <path
          d="M16 3L27 7.5V15.5C27 22.8 22.3 27.4 16 29.5C9.7 27.4 5 22.8 5 15.5V7.5L16 3Z"
          fill="#2563eb"
          stroke="#1d4ed8"
          strokeWidth="1"
        />
        <path
          d="M11 16.2L14.6 19.8L21.5 12.5"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
      {text && (
        <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Pakka<span className="text-accent">Deal</span>
        </span>
      )}
    </span>
  );
}
