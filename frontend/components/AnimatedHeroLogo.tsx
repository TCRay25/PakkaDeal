"use client";
import { useState } from "react";

export default function AnimatedHeroLogo() {
  const [animKey, setAnimKey] = useState(0);

  const handleReplay = () => {
    setAnimKey((k) => k + 1);
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center select-none cursor-pointer group"
      onClick={handleReplay}
      title="Click to replay animation"
    >
      <div key={animKey} className="relative w-56 sm:w-64 md:w-72 aspect-[436/357]">
        {/* Left hand (Royal Indigo) slides in from the left */}
        <img
          src="/logo-hand-left.svg"
          alt="PakkaDeal Left Hand"
          width={436}
          height={357}
          className="absolute inset-0 w-full h-full object-contain animate-hand-left pointer-events-none drop-shadow-sm"
        />

        {/* Right hand (Vibrant Green) slides in from the right */}
        <img
          src="/logo-hand-right.svg"
          alt="PakkaDeal Right Hand"
          width={436}
          height={357}
          className="absolute inset-0 w-full h-full object-contain animate-hand-right pointer-events-none drop-shadow-sm"
        />

        {/* Parcel box drops down smoothly from the top */}
        <img
          src="/logo-box.svg"
          alt="PakkaDeal Parcel Box"
          width={436}
          height={357}
          className="absolute inset-0 w-full h-full object-contain animate-box-drop pointer-events-none drop-shadow-sm"
        />
      </div>

      <div className="mt-2 text-[10px] text-neutral-400 dark:text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-mono">
        <span>↻ Click to replay intro</span>
      </div>
    </div>
  );
}
