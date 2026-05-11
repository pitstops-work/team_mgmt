import React from 'react';

export function renderHtmlWithComponents(
  html: string,
  componentMap: Record<string, React.ReactNode>
): React.ReactNode {
  const parts = html.split(/(<div[^>]+data-component="[^"]*"[^>]*><\/div>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/data-component="([^"]*)"/);
        if (match) return <React.Fragment key={i}>{componentMap[match[1]] ?? null}</React.Fragment>;
        return part.trim()
          ? <div key={i} className="db-content" dangerouslySetInnerHTML={{ __html: part }} />
          : null;
      })}
    </>
  );
}
