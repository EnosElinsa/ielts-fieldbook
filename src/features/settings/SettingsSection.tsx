import { useId, type ReactNode } from 'react';

export function SettingsSection({ title, description, children }: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return <section className="settings-group" aria-labelledby={headingId}>
    <header className="settings-group-heading">
      <h3 id={headingId}>{title}</h3>
      {description && <p>{description}</p>}
    </header>
    {children}
  </section>;
}
