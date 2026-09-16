import { ICONS } from "./icon-data";

interface IconProps {
  name: string;
  className?: string;
}

/** The SVG markup is a compile-time constant in icon-data.ts, never user input. */
export function Icon({ name, className }: IconProps) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: ICONS[name] ?? ICONS.star }} />;
}
