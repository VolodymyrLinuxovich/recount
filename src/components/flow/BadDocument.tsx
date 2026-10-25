"use client";

// The patient's photo after we rejected it: a red frame and a plain label under it, so it's
// clear at a glance that this picture can't be used.
export function BadDocument({ url, alt, label }: { url: string; alt: string; label: string }) {
  return (
    <figure className="bad-doc">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="bad-doc-img" />
      <figcaption className="bad-doc-label" role="alert">
        <span aria-hidden="true" className="bad-doc-x">✕</span>
        {label}
      </figcaption>
    </figure>
  );
}
