interface RivoxLogoProps {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  inverse?: boolean;
}

export default function RivoxLogo({
  className = "",
  iconClassName = "w-10 h-10",
  wordmarkClassName = "",
  showWordmark = true,
  inverse = false,
}: RivoxLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <img src="/rivox-mark.svg" alt="" aria-hidden="true" className={`shrink-0 ${iconClassName}`} />
      {showWordmark && (
        <span className={`text-[1.35rem] font-black tracking-[-0.045em] ${inverse ? "text-white" : "text-slate-950"} ${wordmarkClassName}`.trim()}>
          Rivox
        </span>
      )}
    </span>
  );
}
