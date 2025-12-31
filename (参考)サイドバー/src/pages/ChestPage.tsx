import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLayout } from "../context/LayoutContext";
import Section from "../components/Section";
import PageIframe from "../components/PageIframe";

const basePath =
  import.meta.env.BASE_URL === "/" || import.meta.env.BASE_URL === ""
    ? ""
    : import.meta.env.BASE_URL.replace(/\/$/, "");

const buildAppPath = (relative: string) => {
  const trimmed = relative.replace(/^\/+/, "");
  const url = `${basePath}/${trimmed}`.replace(/^\/\//, "/");
  return url.startsWith("/") ? url : `/${url}`;
};

const ChestPage: React.FC = () => {
  const { layout } = useLayout();
  const [showLegacy, setShowLegacy] = useState(false);
  const legacyUrl = useMemo(() => buildAppPath("legacy/chest.html"), []);

  const imageMap = useMemo(
    () => ({
      neck: buildAppPath("images/chest/chest-01-neck.jpg"),
      anterior: buildAppPath("images/chest/chest-02-anterior.jpg"),
      heartPalpation: buildAppPath("images/chest/chest-03-heart-palpation.jpg"),
      heartAuscultation: buildAppPath("images/chest/chest-04-heart-auscultation.jpg"),
      lungPercussionAnterior: buildAppPath("images/chest/chest-05-lung-percussion-anterior.jpg"),
      lungAuscultationAnterior: buildAppPath("images/chest/chest-06-lung-auscultation-anterior.jpg"),
      backInspection: buildAppPath("images/chest/chest-07-back-inspection.jpg"),
      lungPercussionPosterior: buildAppPath("images/chest/chest-08-lung-percussion-posterior.jpg"),
      lungAuscultationPosterior: buildAppPath("images/chest/chest-09-lung-auscultation-posterior.jpg"),
    }),
    []
  );

  const [audioMap, setAudioMap] = useState<Record<string, string> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);

  useEffect(() => {
    const loadAudioMap = async () => {
      try {
        const res = await fetch(buildAppPath("audio/audio_map.json"));
        if (!res.ok) return;
        const json = (await res.json()) as Record<string, string>;
        setAudioMap(json);
      } catch {
        // ignore, audio will be disabled
      }
    };
    loadAudioMap();
  }, []);

  const handlePlay = (key: string) => {
    if (!audioMap) return;
    const file = audioMap[key];
    if (!file) {
      // console.warn("Audio not found for key:", key);
      return;
    }
    const src = buildAppPath(`audio/${file}`);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(src);
    audioRef.current = audio;
    setCurrentKey(key);
    const cleanup = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
      setCurrentKey((prev) => (prev === key ? null : prev));
    };
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);
    audio.play().catch(cleanup);
  };

  const layoutClass =
    layout === "two-column"
      ? "layout-two-column"
      : layout === "single-column"
      ? "layout-single-column"
      : "";

  return (
    <div className={`container ${layoutClass}`}>
      <Link to="/" className="back-link">
        ← トップページに戻る
      </Link>
      <h1>胸部</h1>


      <Section title="頸部血管（Neck Vessels）" level={2}>
        <Section title="視診（Inspection）" level={3}>
          <p>
            外頸静脈の怒張・虚脱、右内頸静脈の拍動の有無を仰臥位・座位で観察します。
          </p>
          <div className="figure-row">
            <div className="section-figure">
              <img src={imageMap.neck} alt="頸部血管の視診イメージ" loading="lazy" />
            </div>
            <ul>
              <li
                className={`question-item ${
                  currentKey ===
                  "First, I'm just going to have a look at your neck."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "First, I'm just going to have a look at your neck."
                  )
                }
              >
                <div className="question-text">
                  "First, I'm just going to <b>have a look at your neck</b>{" "}
                  <span className="paraphrase">(examine, inspect, check)</span>."
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey ===
                  "Could you turn your head that way, please?"
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Could you turn your head that way, please?"
                  )
                }
              >
                <div className="question-text">
                  "Could you <b>turn your head</b>{" "}
                  <span className="paraphrase">(look this way)</span> that way, please?"
                </div>
              </li>
            </ul>
          </div>
        </Section>

        <Section title="聴診（Auscultation）" level={3}>
          <p>頸動脈の雑音（bruit）の有無を聴診します。</p>
          <ul>
            <li
              className={`question-item ${
                currentKey ===
                "Now, I'll use my stethoscope to listen to the carotid arteries on both sides of your neck."
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                handlePlay(
                  "Now, I'll use my stethoscope to listen to the carotid arteries on both sides of your neck."
                )
              }
            >
              <div className="question-text">
                "Now, I'll use my <b>stethoscope</b>{" "}
                <span className="paraphrase">(chest piece)</span> to <b>listen to</b>{" "}
                <span className="paraphrase">(auscultate)</span> the <b>carotid arteries</b>{" "}
                <span className="paraphrase">(neck arteries)</span> on both sides of your neck."
              </div>
            </li>
            <li
              className={`question-item ${
                currentKey ===
                "I apologize if my stethoscope is a little cold."
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                handlePlay("I apologize if my stethoscope is a little cold.")
              }
            >
              <div className="question-text">
                "I apologize if my <b>stethoscope</b> is a little cold."
              </div>
            </li>
            <li
              className={`question-item ${
                currentKey === "Please let me know if it is."
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                handlePlay("Please let me know if it is.")
              }
            >
              <div className="question-text">
                "Please <b>let me know</b> if it is."
              </div>
            </li>
            <li
              className={`question-item ${
                currentKey ===
                "I'm going to place the stethoscope on your neck now."
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                handlePlay(
                  "I'm going to place the stethoscope on your neck now."
                )
              }
            >
              <div className="question-text">
                "I'm going to place the <b>stethoscope</b> on your neck now."
              </div>
            </li>
            <li
              className={`question-item ${
                currentKey ===
                "It might be slightly cool. Is that okay?"
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                handlePlay(
                  "It might be slightly cool. Is that okay?"
                )
              }
            >
              <div className="question-text">
                "It might be <b>slightly cool</b>. Is that okay?"
              </div>
            </li>
            <li
              className={`question-item ${
                currentKey ===
                "Could you please take a breath in and then hold it for a few seconds?"
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                handlePlay(
                  "Could you please take a breath in and then hold it for a few seconds?"
                )
              }
            >
              <div className="question-text">
                "Could you please <b>take a breath in and then hold it</b>{" "}
                <span className="paraphrase">(inhale and hold your breath)</span> for a few seconds?"
              </div>
            </li>
            <li
              className={`question-item ${
                currentKey === "take a breath in and then hold it" ? "playing" : ""
              }`}
              onClick={() => handlePlay("take a breath in and then hold it")}
            >
              <div className="question-text">
                "<b>Take a breath in and then hold it</b>{" "}
                <span className="paraphrase">(inhale and hold)</span>."
              </div>
            </li>
          </ul>
        </Section>

        <Section title="触診（Palpation）" level={3}>
          <p>頸動脈の脈の減弱やthrill（振戦）の有無を片側ずつ触診します。</p>
        </Section>
      </Section>

      <Section title="前胸部の視診（Inspection of the Anterior Chest）" level={2}>
        <p>
          解剖学的部位（胸骨角、剣状突起、隆椎、肩甲骨下角）、皮膚所見、胸部形態、呼吸様式を評価します。
        </p>
        <div className="figure-row">
          <div className="section-figure">
            <img
              src={imageMap.anterior}
              alt="前胸部視診の参考イメージ"
              loading="lazy"
            />
          </div>
          <ul>
            <li
              className={`question-item ${
                currentKey === "First, I'm going to look at your entire chest area."
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                handlePlay("First, I'm going to look at your entire chest area.")
              }
            >
              <div className="question-text">
                "First, I'm going to <b>look at your entire chest area</b>{" "}
                <span className="paraphrase">(inspect your chest)</span>."
              </div>
            </li>
          </ul>
        </div>
      </Section>

      <Section title="心臓（Heart）" level={2}>
        <Section title="触診（Palpation）" level={3}>
          <p>心尖拍動と胸壁拍動の位置・広がり、thrillの有無を触診します。</p>
          <div className="figure-row">
            <div className="section-figure">
              <img
                src={imageMap.heartPalpation}
                alt="心尖拍動・胸壁拍動の触診イメージ"
                loading="lazy"
              />
            </div>
            <ul>
              <li
                className={`question-item ${
                  currentKey ===
                  "I’m going to check where your heartbeat is on this side. (心尖拍動)"
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "I’m going to check where your heartbeat is on this side. (心尖拍動)"
                  )
                }
              >
                <div className="question-text">
                  "I’m going to <b>check where your heartbeat is</b>{" "}
                  <span className="paraphrase">(locate the apical beat)</span> on this side.{" "}
                  <span className="paraphrase">(心尖拍動)</span>"
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey ===
                  "Now I’m going to put my hand on your chest. (胸壁拍動)"
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Now I’m going to put my hand on your chest. (胸壁拍動)"
                  )
                }
              >
                <div className="question-text">
                  "Now I’m going to <b>put my hand on your chest</b>{" "}
                  <span className="paraphrase">(feel the chest wall motion)</span>.{" "}
                  <span className="paraphrase">(胸壁拍動)</span>"
                </div>
              </li>
            </ul>
          </div>
        </Section>

        <Section title="聴診（Auscultation）" level={3}>
          <p>4領域でI音・II音、分裂、過剰心音、心雑音の有無を聴取します。</p>
          <div className="figure-row">
            <div className="section-figure">
              <img
                src={imageMap.heartAuscultation}
                alt="心臓聴診の参考イメージ"
                loading="lazy"
              />
            </div>
            <ul>
              <li
                className={`question-item ${
                  currentKey ===
                  "Now, I will listen to your heart with my stethoscope."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Now, I will listen to your heart with my stethoscope."
                  )
                }
              >
                <div className="question-text">
                  "Now, I will <b>listen to your heart</b>{" "}
                  <span className="paraphrase">(auscultate your heart)</span> with my <b>stethoscope</b>."
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey ===
                  "it might be slightly cool."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "it might be slightly cool."
                  )
                }
              >
                <div className="question-text">
                  "it might be <b>slightly cool</b>."
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey ===
                  "Please let me know if it is too cold."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Please let me know if it is too cold."
                  )
                }
              >
                <div className="question-text">
                  "Please <b>let me know</b> if it is <b>too cold</b>."
                </div>
              </li>
            </ul>
          </div>
        </Section>
      </Section>

      <Section title="肺（前胸部）Lungs – Anterior" level={2}>
        <Section title="視診（Inspection）" level={3}>
          <p>胸壁運動の左右差、吸気時の陥凹の有無などを観察します。</p>
          <div className="section-figure">
            <img
              src={imageMap.lungAuscultationAnterior}
              alt="前胸部の肺視診・聴診イメージ"
              loading="lazy"
            />
          </div>
        </Section>

        <Section title="打診（Percussion）" level={3}>
          <p>左右差や異常の有無を確認しながら打診します。</p>
          <div className="figure-row">
            <div className="section-figure">
              <img
                src={imageMap.lungPercussionAnterior}
                alt="前胸部の打診イメージ"
                loading="lazy"
              />
            </div>
            <ul>
              <li
                className={`question-item ${
                  currentKey === "Now I'm going to tap along your ribs on your back."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Now I'm going to tap along your ribs on your back."
                  )
                }
              >
                <div className="question-text">
                  "Now I'm going to <b>tap along your ribs</b>{" "}
                  <span className="paraphrase">(percuss your chest)</span> on your back."
                </div>
              </li>
            </ul>
          </div>
        </Section>

        <Section title="聴診（Auscultation）" level={3}>
          <p>呼吸音と副雑音の有無を評価します。</p>
          <div className="figure-row">
            <div className="section-figure">
              <img
                src={imageMap.lungAuscultationAnterior}
                alt="前胸部の肺聴診イメージ"
                loading="lazy"
              />
            </div>
            <ul>
              <li
                className={`question-item ${
                  currentKey ===
                  "Now I’m going to listen to your lungs; please take a deep breath in and out through your mouth."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Now I’m going to listen to your lungs; please take a deep breath in and out through your mouth."
                  )
                }
              >
                <div className="question-text">
                  "Now I’m going to <b>listen to your lungs</b>{" "}
                  <span className="paraphrase">(auscultate your lungs)</span>; please take a deep breath in and out
                  through your mouth."
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey === "Deep breath." ? "playing" : ""
                }`}
                onClick={() => handlePlay("Deep breath.")}
              >
                <div className="question-text">
                  "<b>Deep breath</b>."{" "}
                  <span className="paraphrase">(聴診器を当てて)</span>
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey === "Again." ? "playing" : ""
                }`}
                onClick={() => handlePlay("Again.")}
              >
                <div className="question-text">
                  "<b>Again</b>."{" "}
                  <span className="paraphrase">(別のところ)</span>
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey === "In." ? "playing" : ""
                }`}
                onClick={() => handlePlay("In.")}
              >
                <div className="question-text">
                  "<b>In</b>."{" "}
                  <span className="paraphrase">(吸う時)</span>
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey === "out." ? "playing" : ""
                }`}
                onClick={() => handlePlay("out.")}
              >
                <div className="question-text">
                  "<b>out</b>."{" "}
                  <span className="paraphrase">(吐く時)</span>
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey === "Okay, breathe normally." ? "playing" : ""
                }`}
                onClick={() => handlePlay("Okay, breathe normally.")}
              >
                <div className="question-text">
                  "Okay, <b>breathe normally</b>."{" "}
                  <span className="paraphrase">(終わったら)</span>
                </div>
              </li>
            </ul>
          </div>
        </Section>

        <Section title="発展版（声音振盪など）" level={3}>
          <p>必要に応じて egophony, bronchophony, tactile fremitus を評価します。</p>
        </Section>
      </Section>

      <Section title="背部の視診（Inspection of the Back）" level={2}>
        <p>背部の皮膚所見や胸郭の形状・左右差を確認します。</p>
        <div className="figure-row">
          <div className="section-figure">
            <img
              src={imageMap.backInspection}
              alt="背部視診の参考イメージ"
              loading="lazy"
            />
          </div>
        </div>
      </Section>

      <Section title="肺（背部）Lungs – Posterior" level={2}>
        <Section title="視診（Inspection）" level={3}>
          <p>胸壁運動の左右差、鎖骨上窩・肋間の陥凹の有無などを観察します。</p>
          <div className="figure-row">
            <div className="section-figure">
              <img
                src={imageMap.lungAuscultationPosterior}
                alt="背部の肺視診・聴診イメージ"
                loading="lazy"
              />
            </div>
          </div>
        </Section>

        <Section title="打診（Percussion）" level={3}>
          <p>背部全体を打診し、清音と濁音の境界や横隔膜の呼吸性移動を確認します。</p>
          <div className="figure-row">
            <div className="section-figure">
              <img
                src={imageMap.lungPercussionPosterior}
                alt="背部の打診イメージ"
                loading="lazy"
              />
            </div>
            <ul>
              <li
                className={`question-item ${
                  currentKey === "Now I'm going to tap along your ribs on your back."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Now I'm going to tap along your ribs on your back."
                  )
                }
              >
                <div className="question-text">
                  "Now I'm going to <b>tap along your ribs</b>{" "}
                  <span className="paraphrase">(percuss your chest)</span> on your back."
                </div>
              </li>
            </ul>
          </div>
        </Section>

        <Section title="聴診（Auscultation）" level={3}>
          <p>深呼吸してもらいながら背部全体の呼吸音を聴診します。</p>
          <div className="figure-row">
            <div className="section-figure">
              <img
                src={imageMap.lungAuscultationPosterior}
                alt="背部の肺聴診イメージ"
                loading="lazy"
              />
            </div>
            <ul>
              <li
                className={`question-item ${
                  currentKey ===
                  "Now I’m going to listen to your lungs in the back; please take a deep breath in and out through your mouth."
                    ? "playing"
                    : ""
                }`}
                onClick={() =>
                  handlePlay(
                    "Now I’m going to listen to your lungs in the back; please take a deep breath in and out through your mouth."
                  )
                }
              >
                <div className="question-text">
                  "Now I’m going to <b>listen to your lungs in the back</b>{" "}
                  <span className="paraphrase">(auscultate your lungs posteriorly)</span>; please take a deep breath in
                  and out through your mouth."
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey === "Deep breath." ? "playing" : ""
                }`}
                onClick={() => handlePlay("Deep breath.")}
              >
                <div className="question-text">
                  "<b>Deep breath</b>."{" "}
                  <span className="paraphrase">(聴診器を当てて)</span>
                </div>
              </li>
              <li
                className={`question-item ${
                  currentKey === "Again." ? "playing" : ""
                }`}
                onClick={() => handlePlay("Again.")}
              >
                <div className="question-text">
                  "<b>Again</b>."{" "}
                  <span className="paraphrase">(別のところ)</span>
                </div>
              </li>
            </ul>
          </div>
        </Section>
      </Section>

      <Section title="参考動画（YouTube）" level={2}>
        <p>胸部診察の流れや手技のイメージを掴むための動画です。</p>
        <ul>
          <li>
            <a
              href="https://youtu.be/mCW8aPGgHQA?si=0l-1WXzSnuSD7XB3"
              target="_blank"
              rel="noreferrer"
            >
              Chest Examination Video 1
            </a>
          </li>
          <li>
            <a
              href="https://youtu.be/CyQqxXZyQVw?si=ttLPDPnnqSH2ep1z"
              target="_blank"
              rel="noreferrer"
            >
              Chest Examination Video 2
            </a>
          </li>
        </ul>
      </Section>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: 12 }}>
        <button
          type="button"
          className="auth-button auth-button-primary"
          onClick={() => setShowLegacy((prev) => !prev)}
        >
          {showLegacy ? "旧版を閉じる" : "旧版を表示"}
        </button>
        <Link to="/chest/old" className="back-link">
          旧版を別ページで開く
        </Link>
      </div>

      {showLegacy && (
        <Section title="旧版（Chest legacy）" level={2} fullWidth>
          <PageIframe src={legacyUrl} title="胸部診察（旧版）" />
        </Section>
      )}
    </div>
  );
};

export default ChestPage;
