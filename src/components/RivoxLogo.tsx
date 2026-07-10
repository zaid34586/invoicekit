interface RivoxLogoProps {
  className?: string;
  iconClassName?: string;
  showWordmark?: boolean;
  inverse?: boolean;
}

export default function RivoxLogo({
  className = "",
  iconClassName = "w-10 h-10",
  showWordmark = true,
  inverse = false,
}: RivoxLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-br from-primary-500 via-primary-600 to-violet-700 shadow-[0_10px_30px_rgba(79,70,229,0.28)] ${iconClassName}`}>
        <svg viewBox="0 0 32 32" className="h-[62%] w-[62%]" aria-hidden="true">
          <path d="M8 7.5h16L13.5 16H24L8 24.5l7.7-8.5H8z" fill="white" fillOpacity="0.98" />
        </svg>
        <span className="absolute inset-x-1 bottom-0 h-px bg-white/40" />
      </span>
      {showWordmark && (
        <span className={`text-[1.35rem] font-black tracking-[-0.045em] ${inverse ? "text-white" : "text-slate-950"}`}>
          Rivox
        </span>
      )}
    </span>
  );
}
