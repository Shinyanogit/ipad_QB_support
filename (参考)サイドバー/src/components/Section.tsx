import React, { useId, useState } from 'react';

type Props = {
  title: string;
  level?: 2 | 3 | 4;
  defaultCollapsed?: boolean;
  children?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
};

const Section: React.FC<Props> = ({
  title,
  level = 2,
  defaultCollapsed = true,
  children,
  fullWidth = false,
  className = "",
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const contentId = useId();

  const HeadingTag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
  const classes = [
    "section",
    fullWidth ? "section-full" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <HeadingTag
        className={collapsed ? 'collapsed' : ''}
        role="button"
        aria-expanded={!collapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed(!collapsed)}
      >
        {title}
      </HeadingTag>
      <div
        id={contentId}
        className={`section-content ${collapsed ? 'collapsed' : 'expanded'}`}
        aria-hidden={collapsed}
      >
        {children}
      </div>
    </div>
  );
};

export default Section;
