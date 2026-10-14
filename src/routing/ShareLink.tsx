import { useEffect, useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

/**
 * Copies the address of whatever is on screen. The URL is kept in step with the
 * state by `useUrlSync`, so there is nothing to build here.
 */
export function ShareLink({ className }: { className?: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(id)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
    } catch {
      // clipboard blocked (insecure context, denied permission): select it instead
      window.prompt(t.app.copyLink, location.href)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={copy}
      aria-label={copied ? t.app.linkCopied : t.app.copyLink}
      title={copied ? t.app.linkCopied : t.app.copyLink}
    >
      {copied ? <Check className="text-brand" /> : <Link2 />}
      <span className="hidden sm:inline">{copied ? t.app.linkCopied : t.app.copyLink}</span>
    </Button>
  )
}
