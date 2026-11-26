import * as React from "react";
import { cn } from "@lib/shared/cn";

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
        "disabled:pointer-events-none disabled:opacity-50",
        {
          "bg-zinc-900 text-white hover:bg-zinc-800": variant === "default",
          "border border-zinc-300 bg-white hover:bg-zinc-50":
            variant === "outline",
          "hover:bg-zinc-100": variant === "ghost",
          "bg-red-600 text-white hover:bg-red-700": variant === "destructive",
        },
        {
          "h-9 px-4 text-sm": size === "default",
          "h-8 px-3 text-xs": size === "sm",
          "h-11 px-6": size === "lg",
        },
        className,
      )}
      {...props}
    />
  );
}
