import { Building2 } from 'lucide-react';
import { useState } from 'react';

/** Shows the logo from a URL, or a placeholder when there is none / it fails to load. */
export function LogoPreview({ url, name }: { url: string | null | undefined; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url && failedUrl !== url;
  return (
    <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
      {showImage ? (
        <img
          src={url}
          alt={`${name} logo`}
          className="size-full object-contain"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Building2 className="size-8 text-muted-foreground" aria-label="No logo" />
      )}
    </div>
  );
}
