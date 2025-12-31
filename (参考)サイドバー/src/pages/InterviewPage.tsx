import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLayout } from "../context/LayoutContext";
import { QASection } from "../data/interviewQA";

const basePath =
  import.meta.env.BASE_URL === "/" || import.meta.env.BASE_URL === ""
    ? ""
    : import.meta.env.BASE_URL.replace(/\/$/, "");

const buildAppPath = (relative: string) => {
  const trimmed = relative.replace(/^\/+/, "");
  const url = `${basePath}/${trimmed}`.replace(/^\/\//, "/");
  return url.startsWith("/") ? url : `/${url}`;
};

type Props = {
  title: string;
  sections: QASection[];
  enableAudio?: boolean;
  audioFolder?: string; // e.g. "audio-interview"
};

const InterviewPage: React.FC<Props> = ({
  title,
  sections,
  enableAudio = false,
  audioFolder = "audio-interview",
}) => {
  const { layout } = useLayout();
  const layoutClass =
    layout === "two-column"
      ? "layout-two-column"
      : layout === "single-column"
      ? "layout-single-column"
      : "";

  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (slug?: string) => {
    if (!enableAudio || !slug) return;
    const src = buildAppPath(`${audioFolder}/${slug}.mp3`);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(src);
    audioRef.current = audio;
    setCurrentSlug(slug);
    const cleanup = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
      setCurrentSlug((prev) => (prev === slug ? null : prev));
    };
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);
    audio.play().catch(cleanup);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setCurrentSlug(null);
  };

  return (
    <div className={`container ${layoutClass}`}>
      <Link to="/" className="back-link">
        ← トップページに戻る
      </Link>
      <h1>{title}</h1>
      {enableAudio && (
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <button type="button" className="primary-button" onClick={stopAudio}>
            Stop
          </button>
        </div>
      )}
      {sections.map((section) => (
        <section key={section.title} className="qa-section">
          <h2>{section.title}</h2>
          {section.items.map((item) => (
            <div key={item.question} className="qa-item">
              <div className="qa-text">
                <p className="question">{item.question}</p>
                <p className="answer" dangerouslySetInnerHTML={{ __html: item.answer }} />
              </div>
              {enableAudio && item.slug && (
                <div className="qa-controls">
                  <button
                    type="button"
                    className={currentSlug === item.slug ? "playing" : ""}
                    onClick={() => handlePlay(item.slug)}
                  >
                    {currentSlug === item.slug ? "Playing..." : "Play"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};

export default InterviewPage;
