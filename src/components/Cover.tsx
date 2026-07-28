import { useEffect, useState, type ReactNode } from "react";

import { cacheCover, coverSrc } from "../lib/api";

/** Shows a cover: caches the remote URL locally, then renders via the asset
 *  protocol. Falls back to the title when there's no cover or the fetch fails.
 *  `children` are overlaid inside the (relatively-positioned) cover box. */
export function Cover({
  url,
  title,
  className = "cover",
  children,
}: {
  url?: string;
  title: string;
  className?: string;
  children?: ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    if (!url) return;
    cacheCover(url)
      .then((path) => alive && setSrc(coverSrc(path)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url]);

  const loading = !!url && !src && !failed;

  return (
    <div className={className}>
      {src && !failed && (
        <img
          className="cover__img"
          src={src}
          alt={title}
          onError={() => setFailed(true)}
        />
      )}
      {loading && <div className="cover__loading" />}
      {!url || failed ? <div className="cover__fallback">{title}</div> : null}
      {children}
    </div>
  );
}
