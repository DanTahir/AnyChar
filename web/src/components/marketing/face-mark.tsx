import Image from "next/image";

type Props = {
  size?: number;
  className?: string;
  preload?: boolean;
};

/** The AnyChar face mark inside a spinning gradient halo. */
export function FaceMark({ size = 80, className = "", preload = false }: Props) {
  return (
    <span
      className={`mk-halo inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="relative flex h-full w-full items-center justify-center rounded-full bg-[#0d0919]">
        <Image
          src="/brand/anychar-mark.png"
          alt=""
          width={size}
          height={size}
          preload={preload}
          className="h-[74%] w-[74%] object-contain"
        />
      </span>
    </span>
  );
}
