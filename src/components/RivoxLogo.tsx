interface RivoxLogoProps {
  className?: string;
  iconClassName?: string;
  showWordmark?: boolean;
  inverse?: boolean;
  showTagline?: boolean;
}

export default function RivoxLogo({
  className = "",
  iconClassName = "w-10 h-10",
  showWordmark = true,
  inverse = false,
  showTagline = false,
}: RivoxLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        className={`${iconClassName} shrink-0 object-contain drop-shadow-sm`}
      />
      {showWordmark && (
        <span className="leading-none">
          <span
            className={`block text-[1.35rem] font-black tracking-[-0.045em] ${
              inverse ? "text-white" : "text-slate-950"
            }`}
          >
            Rivox
          </span>
          {showTagline && (
            <span
              className={`mt-1 block text-[9px] font-bold uppercase tracking-[0.22em] ${
                inverse ? "text-violet-200" : "text-violet-500"
              }`}
            >
              Business OS
            </span>
          )}
        </span>
      )}
    </span>
  );
}
