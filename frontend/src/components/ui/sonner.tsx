"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // BUGFIX (DUP-SRCDocs-1) : z-index élevé pour apparaître au-dessus
          // des dialogs Radix (z-50) et de leur overlay (z-50).
          zIndex: 100,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
