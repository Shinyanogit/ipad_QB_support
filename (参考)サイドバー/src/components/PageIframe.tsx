import React from 'react';

type Props = {
  src: string;
  title: string;
};

const PageIframe: React.FC<Props> = ({ src, title }) => {
  return (
    <div className="iframe-wrapper" style={{ height: '80vh' }}>
      <iframe
        title={title}
        src={src}
        style={{ width: '100%', height: '100%', border: '1px solid var(--border-color)', borderRadius: 8 }}
      />
      <p className="description">注意: 現段階は既存ページをiframeで内包しています。次段階でReactネイティブへ移植します。</p>
    </div>
  );
};

export default PageIframe;

