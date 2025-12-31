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

const HeadNeckPage: React.FC = () => {
  const { layout } = useLayout();
  const [showLegacy, setShowLegacy] = useState(false);
  const legacyUrl = useMemo(() => buildAppPath("legacy/head-neck.html"), []);

  const imageMap = useMemo(
    () => ({
      faceOverview: buildAppPath("images/head-neck/sd01-060-010.jpg"),
      hair1: buildAppPath("images/head-neck/sd01-056-010.jpg"),
      hair2: buildAppPath("images/head-neck/sd01-060-020.jpg"),
      hair3: buildAppPath("images/head-neck/sd01-060-030.jpg"),
      hair4: buildAppPath("images/head-neck/sd01-061-010.jpg"),
      palpebral: buildAppPath("images/head-neck/sd01-062-010.jpg"),
      bulbar: buildAppPath("images/head-neck/sd01-062-020.jpg"),
      exophthalmos1: buildAppPath("images/head-neck/sd01-062-030.jpg"),
      exophthalmos2: buildAppPath("images/head-neck/sd01-065-070.jpg"),
      otoscope: buildAppPath("images/head-neck/sd01-066-030.jpg"),
      sinus1: buildAppPath("images/head-neck/sd01-066-040.jpg"),
      sinus2: buildAppPath("images/head-neck/sd01-071-020.jpg"),
      sinus3: buildAppPath("images/head-neck/sd01-071-030.jpg"),
      oralOverview: buildAppPath("images/head-neck/image.png"),
      teeth: buildAppPath("images/head-neck/sd01-072-020.jpg"),
      buccal: buildAppPath("images/head-neck/sd01-072-030.jpg"),
      tongue: buildAppPath("images/head-neck/sd01-072-040.jpg"),
      floorOfMouth: buildAppPath("images/head-neck/sd01-072-040 1.jpg"),
      salivary1: buildAppPath("images/head-neck/sd01-076-030.jpg"),
      salivary2: buildAppPath("images/head-neck/sd01-076-040.jpg"),
      parotid: buildAppPath("images/head-neck/sd01-076-010.jpg"),
      submandibular: buildAppPath("images/head-neck/sd01-076-020.jpg"),
      lymph1: buildAppPath("images/head-neck/sd01-083-020.jpg"),
      lymph2: buildAppPath("images/head-neck/sd01-084-010.jpg"),
      lymph3: buildAppPath("images/head-neck/sd01-085-010.jpg"),
      lymph4: buildAppPath("images/head-neck/sd01-086-010.jpg"),
      supraclavicular: buildAppPath("images/head-neck/sd01-088-030.jpg"),
      thyroidOverview: buildAppPath("images/head-neck/sd01-078-020.jpg"),
      thyroidInspect: buildAppPath("images/head-neck/sd01-077-010.jpg"),
      thyroidPalpation: buildAppPath("images/head-neck/sd01-077-030.jpg"),
      thyroidAuscultation: buildAppPath("images/head-neck/sd01-077-040.jpg"),
    }),
    []
  );

  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );

  const [audioMap, setAudioMap] = useState<Record<string, string> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);

  const bindImage = (
    src: string,
    alt: string
  ): React.ImgHTMLAttributes<HTMLImageElement> => ({
    src,
    alt,
    loading: "lazy",
    className: "zoomable",
    onClick: () => setLightbox({ src, alt }),
  });

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

  type QuestionLine = string | { text: string; content?: React.ReactNode };

  const renderQuestions = (lines: QuestionLine[]) => (
    <ul>
      {lines.map((line) => {
        const text = typeof line === "string" ? line : line.text;
        const content =
          typeof line === "string" ? line : line.content ?? line.text;
        return (
          <li
            key={text}
            className={`question-item ${
              currentKey === text ? "playing" : ""
            }`}
            data-text={text}
            onClick={() => handlePlay(text)}
          >
            <div className="question-text">{content}</div>
          </li>
        );
      })}
    </ul>
  );

  const renderNeuroLink = () => (
    <ul>
      <li
        className="question-item"
        data-text="→神経系"
      >
        {/* → Neurological examination */}
        <Link to="/neurological" className="question-text">
          →神経系
        </Link>
      </li>
    </ul>
  );

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
      <h1>頭頸部</h1>

      <Section title="頭部・顔面 (Head and Face)" level={2}>
        <Section title="顔・顔貌の観察 (Observation of Face and Facial Expression)" level={3}>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.faceOverview, "顔・顔貌の観察")} />
            </div>
            <div className="text-block">
              <ul>
                <li
                  className={`question-item ${
                    currentKey === "I will start by examining your head."
                      ? "playing"
                      : ""
                  }`}
                  data-text="I will start by examining your head."
                  onClick={() =>
                    handlePlay("I will start by examining your head.")
                  }
                >
                  <div className="question-text">
                    {/* それでは頭の診察から始めたいと思います。 */}
                    I will start by{" "}
                    <b>examining your head</b>{" "}
                    <span className="paraphrase">
                      (having a look at your head)
                    </span>
                    .
                  </div>
                </li>
                <li
                  className={`question-item ${
                    currentKey ===
                    "Please tell me right away if you feel any pain."
                      ? "playing"
                      : ""
                  }`}
                  data-text="Please tell me right away if you feel any pain."
                  onClick={() =>
                    handlePlay(
                      "Please tell me right away if you feel any pain."
                    )
                  }
                >
                  <div className="question-text">
                    {/* 痛いところがあったら遠慮なくおっしゃってください。 */}
                    Please{" "}
                    <b>tell me right away</b>{" "}
                    <span className="paraphrase">
                      (let me know immediately)
                    </span>{" "}
                    if you feel any pain.
                  </div>
                </li>
              </ul>
              <p>(全身状態、精神状態を反映するため確認する。)</p>
            </div>
          </div>
        </Section>

        <Section title="頭髪の観察 (Observation of Hair)" level={3}>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.hair1, "頭髪の観察")} />
            </div>
            <div className="text-block">
              <ul>
                <li
                  className={`question-item ${
                    currentKey ===
                    "I am going to gently feel your hair now."
                      ? "playing"
                      : ""
                  }`}
                  data-text="I am going to gently feel your hair now."
                  onClick={() =>
                    handlePlay(
                      "I am going to gently feel your hair now."
                    )
                  }
                >
                  <div className="question-text">
                    {/* それでは少し髪の毛を触りますよ。 */}
                    I am going to{" "}
                    <b>gently feel your hair</b>{" "}
                    <span className="paraphrase">
                      (touch your hair lightly)
                    </span>{" "}
                    now.
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.hair2, "頭髪の観察")} />
            </div>
            <div className="text-block">
              <p>(脱毛・色調・皮疹・腫瘤の確認)</p>
            </div>
          </div>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.hair3, "頭髪の観察")} />
            </div>
            <div className="text-block">
              {renderQuestions([
                {
                  text:
                    "I will press lightly here; please let me know if any area is tender.",
                  content: (
                    <>
                      {/* 軽く押さえますよ、痛いところはありませんか。 */}
                      I will{" "}
                      <b>press lightly</b>{" "}
                      <span className="paraphrase">
                        (apply gentle pressure)
                      </span>{" "}
                      here; please{" "}
                      <b>let me know</b>{" "}
                      <span className="paraphrase">
                        (tell me)
                      </span>{" "}
                      if any area is tender.
                    </>
                  ),
                },
              ])}
            </div>
          </div>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.hair4, "頭髪の観察")} />
            </div>
            <div className="text-block">
              <p>手指消毒。</p>
            </div>
          </div>
        </Section>

        <Section title="頭皮・頭蓋の触診 (Palpation of Scalp and Skull)" level={3} />
      </Section>

      <Section title="眼 (Eyes)" level={2}>
        {renderQuestions([
          {
            text: "Now I would like to examine your eyes.",
            content: (
              <>
                {/* それでは目の診察をしたいと思います。 */}
                Now I would like to{" "}
                <b>examine your eyes</b>{" "}
                <span className="paraphrase">
                  (check your eyes)
                </span>
                .
              </>
            ),
          },
        ])}
        <Section title="眼瞼結膜の観察 (Palpebral Conjunctiva)" level={3}>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.palpebral, "眼瞼結膜の観察")} />
            </div>
            <div className="text-block">
              {renderQuestions([
                {
                  text:
                    "I am going to touch around your eyes; please tell me if it feels cold or uncomfortable.",
                  content: (
                    <>
                      {/* 顔に触りますので、冷たかったりしたらおっしゃってください。 */}
                      I am going to{" "}
                      <b>touch around your eyes</b>{" "}
                      <span className="paraphrase">
                        (feel gently around your eyes)
                      </span>
                      ; please{" "}
                      <b>tell me</b>{" "}
                      <span className="paraphrase">
                        (let me know)
                      </span>{" "}
                      if it feels cold or uncomfortable.
                    </>
                  ),
                },
              ])}
              <p>(眼瞼結膜：充血・浮腫・貧血確認)</p>
            </div>
          </div>
        </Section>

        <Section title="眼球結膜の観察 (Bulbar Conjunctiva)" level={3}>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.bulbar, "眼球結膜の観察")} />
            </div>
            <div className="text-block">
              {renderQuestions([
                {
                  text: "Please look up, and then look down.",
                  content: (
                    <>
                      {/* 上を向いてください。/下を向いてください。 */}
                      Please{" "}
                      <b>look up</b>{" "}
                      <span className="paraphrase">
                        (raise your eyes)
                      </span>
                      , and then{" "}
                      <b>look down</b>{" "}
                      <span className="paraphrase">
                        (lower your eyes)
                      </span>
                      .
                    </>
                  ),
                },
              ])}
              <p>(眼球結膜：充血・黄染・出血確認)</p>
            </div>
          </div>
        </Section>

        <Section title="眼球突出の観察 (Exophthalmos)" level={3}>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.exophthalmos1, "眼球突出の観察")} />
            </div>
            <div className="text-block">
              {renderQuestions([
                {
                  text: "I will look at your eyes from the side.",
                  content: (
                    <>
                      {/* ちょっと横から見ますね。(両側方から見る。) */}
                      I will{" "}
                      <b>look at your eyes from the side</b>{" "}
                      <span className="paraphrase">
                        (view your eyes from the side)
                      </span>
                      .
                    </>
                  ),
                },
              ])}
            </div>
          </div>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.exophthalmos2, "眼球突出の観察（側面）")} />
            </div>
            <div className="text-block">
              {renderQuestions([
                {
                  text:
                    "While I stand behind you, could you gently look up for me?",
                  content: (
                    <>
                      {/* (後ろから回り込んで)軽く上を向いてもらえますか。 */}
                      While I stand behind you, could you{" "}
                      <b>gently look up</b>{" "}
                      <span className="paraphrase">
                        (raise your gaze a little)
                      </span>{" "}
                      for me?
                    </>
                  ),
                },
              ])}
            </div>
          </div>
        </Section>

        <Section title="瞳孔・虹彩の観察 (Pupil and Iris)" level={3}>
          <p>(左右差および色・形，水晶体の混濁などを調べる．)</p>
        </Section>

        <Section title="視野の検査 (Visual Field Test)" level={3}>
          {renderNeuroLink()}
        </Section>

        <Section title="眼球運動の検査 (Extraocular Movements)" level={3}>
          {renderNeuroLink()}
        </Section>

        <Section title="対光反射の検査 (Pupillary Light Reflex)" level={3}>
          {renderNeuroLink()}
        </Section>

        <Section title="眼底の検査 (Fundoscopic Examination)" level={3}>
          {renderNeuroLink()}
        </Section>
      </Section>

      <Section title="耳 (Ears)" level={2}>
        {renderQuestions([
          {
            text: "Next, I would like to examine your ears.",
            content: (
              <>
                {/* 続いて耳の診察をします。 */}
                Next, I would like to{" "}
                <b>examine your ears</b>{" "}
                <span className="paraphrase">
                  (take a look at your ears)
                </span>
                .
              </>
            ),
          },
          {
            text:
              "I will use this instrument, an otoscope, to look inside your ears. Please tell me if you feel any pain.",
            content: (
              <>
                {/* 耳はこちらの器具(耳鏡)を使って診察します。痛かったりしたら教えて下さい。 */}
                I will use this instrument, an{" "}
                <b>otoscope</b>{" "}
                <span className="paraphrase">
                  (ear scope)
                </span>{" "}
                to{" "}
                <b>look inside your ears</b>{" "}
                <span className="paraphrase">
                  (examine your ear canals)
                </span>
                . Please{" "}
                <b>tell me</b>{" "}
                <span className="paraphrase">
                  (let me know)
                </span>{" "}
                if you feel any pain.
              </>
            ),
          },
        ])}

        <Section title="耳介およびその周囲の観察 (Observation of Auricle)" level={3}>
          {renderQuestions([
            // "軽くこちら側を向いてください。"
            {
              text: "Please turn your head slightly this way.",
              content: (
                <>
                  Please{" "}
                  <b>turn your head</b>{" "}
                  <span className="paraphrase">
                    (turn your face)
                  </span>{" "}
                  slightly this way.
                </>
              ),
            },
          ])}
          <p>(変形・結節・皮疹確認)</p>
        </Section>

        <Section title="耳介およびその周囲の触診 (Palpation of Auricle)" level={3}>
          {renderQuestions([
            // "耳を引っ張りますよ、痛かったらおっしゃってください。"
            {
              text:
                "I am going to gently pull on your ear; please let me know if it hurts.",
              content: (
                <>
                  I am going to{" "}
                  <b>gently pull on your ear</b>{" "}
                  <span className="paraphrase">
                    (tug your ear lightly)
                  </span>
                  ; please{" "}
                  <b>let me know</b>{" "}
                  <span className="paraphrase">
                    (tell me)
                  </span>{" "}
                  if it hurts.
                </>
              ),
            },
          ])}
        </Section>

        <Section title="聴力検査 (Hearing Test)" level={3}>
          <p>*省略</p>
        </Section>

        <Section title="外耳道・鼓膜の観察 (Otoscopic Examination)" level={3}>
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.otoscope, "外耳道・鼓膜の観察")} />
            </div>
            <div className="text-block">
              {renderQuestions([
                {
                  text:
                    "Please turn your head to the other side, and then face straight ahead.",
                  content: (
                    <>
                      {/* 反対側を向いて下さい。/まっすぐ向いてください。 */}
                      Please{" "}
                      <b>turn your head to the other side</b>{" "}
                      <span className="paraphrase">
                        (look the other way)
                      </span>
                      , and then{" "}
                      <b>face straight ahead</b>{" "}
                      <span className="paraphrase">
                        (look straight ahead)
                      </span>
                      .
                    </>
                  ),
                },
              ])}
            </div>
          </div>
        </Section>
      </Section>

      <Section title="鼻・副鼻腔 (Nose and Paranasal Sinuses)" level={2}>
        {renderQuestions([
          {
            text: "Next, I will examine your nose and sinuses.",
            content: (
              <>
                {/* 次に鼻周りを診察します。 */}
                Next, I will{" "}
                <b>examine your nose and sinuses</b>{" "}
                <span className="paraphrase">
                  (check your nose and sinus areas)
                </span>
                .
              </>
            ),
          },
        ])}

        <Section title="鼻全体の観察 (Observation of Nose)" level={3}>
          <p>(変形・皮疹確認)</p>
        </Section>

        <Section title="副鼻腔の診察 (Examination of Paranasal Sinuses)" level={3}>
         <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.sinus1, "副鼻腔の診察")} />
            </div>
            <div className="text-block">
              {renderQuestions([
                {
                  text:
                    "I am going to press on your face; please tell me if you feel any pain.",
                  content: (
                    <>
                      {/* 顔を触りますので、痛かったりしたらおっしゃってください。 */}
                      I am going to{" "}
                      <b>press on your face</b>{" "}
                      <span className="paraphrase">
                        (press gently over your sinuses)
                      </span>
                      ; please{" "}
                      <b>tell me</b>{" "}
                      <span className="paraphrase">
                        (let me know)
                      </span>{" "}
                      if you feel any pain.
                    </>
                  ),
                },
              ])}
              <p>
                (上顎洞(目の下)と前頭洞(目の上)の圧痛・叩打痛確認)
              </p>
            </div>
          </div>
          <div className="figure-row">
            {[imageMap.sinus2, imageMap.sinus3].map((src) => (
              <div className="section-figure" key={src}>
                <img {...bindImage(src, "副鼻腔の診察")} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="鼻閉塞の確認 (Nasal Obstruction Test)" level={3}>
          <p>省略</p>
        </Section>

        <Section title="鼻腔の観察 (Nasal Cavity Examination)" level={3}>
          <p>省略</p>
        </Section>
      </Section>

      <Section title="口唇・口腔・咽頭 (Lips, Oral Cavity, and Pharynx)" level={2}>
        <div className="section-figure">
          <img {...bindImage(imageMap.oralOverview, "口腔全体の観察")} />
        </div>
        {renderQuestions([
          // "次に口と喉の検査をします。楽にしていてください。 (舌圧子とペンライト準備)"
          "Next, I will examine your mouth and throat. Please relax.",
        ])}

        <Section title="口唇の観察 (Observation of Lips)" level={3}>
          <p>(ペンライトで口唇を照らす)</p>
        </Section>

        <Section title="歯/歯肉の観察 (Observation of Teeth and Gingiva)" level={3}>
          {renderQuestions([
            // "これからこのヘラでお口の中を触ります。"
            {
              text:
                "I am going to use this tongue depressor to gently touch inside your mouth.",
              content: (
                <>
                  I am going to use this{" "}
                  <b>tongue depressor</b>{" "}
                  <span className="paraphrase">
                    (wooden stick)
                  </span>{" "}
                  to{" "}
                  <b>gently touch inside your mouth</b>{" "}
                  <span className="paraphrase">
                    (examine the inside of your mouth)
                  </span>
                  .
                </>
              ),
            },
            // "痛かったりしたらおっしゃってください。"
            {
              text: "Please tell me if you feel any pain.",
              content: (
                <>
                  Please{" "}
                  <b>tell me</b>{" "}
                  <span className="paraphrase">
                    (let me know)
                  </span>{" "}
                  if you feel any pain.
                </>
              ),
            },
            // "お口を開けてください。"
            {
              text: "Please open your mouth.",
              content: (
                <>
                  Please{" "}
                  <b>open your mouth</b>{" "}
                  <span className="paraphrase">
                    (open wide)
                  </span>
                  .
                </>
              ),
            },
          ])}
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.teeth, "歯・歯肉の観察")} />
            </div>
            <div className="text-block">
              <p>(歯：欠損・う歯・色素沈着確認) (歯肉：発赤・腫脹・出血確認)</p>
            </div>
          </div>
        </Section>

        <Section title="頬粘膜の観察 (Observation of Buccal Mucosa)" level={3}>
          <div className="section-figure">
            <img {...bindImage(imageMap.buccal, "頬粘膜の観察")} />
          </div>
        </Section>

        <Section title="舌の観察 (Observation of Tongue)" level={3}>
          {renderQuestions([
            // "舌を前にだしてください。"
            {
              text: "Please stick out your tongue.",
              content: (
                <>
                  Please{" "}
                  <b>stick out your tongue</b>{" "}
                  <span className="paraphrase">
                    (put your tongue out)
                  </span>
                  .
                </>
              ),
            },
            // "舌を左に寄せてみてください/右に寄せてください。"
            {
              text:
                "Please move your tongue to the left, and then to the right.",
              content: (
                <>
                  Please{" "}
                  <b>move your tongue to the left and then to the right</b>{" "}
                  <span className="paraphrase">
                    (move your tongue side to side)
                  </span>
                  .
                </>
              ),
            },
          ])}
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.tongue, "舌の観察")} />
            </div>
            <div className="text-block">
              <p>(腫瘤・潰瘍・舌乳頭萎縮)</p>
            </div>
          </div>
        </Section>

        <Section title="口腔底・舌下面の観察 (Observation of Floor of Mouth)" level={3}>
          {renderQuestions([
            // "舌先を上の歯の裏につけてください。"
            {
              text:
                "Please place the tip of your tongue behind your upper front teeth.",
              content: (
                <>
                  Please{" "}
                  <b>place the tip of your tongue behind your upper front teeth</b>{" "}
                  <span className="paraphrase">
                    (rest your tongue tip on the back of your front teeth)
                  </span>
                  .
                </>
              ),
            },
          ])}
          <div className="figure-with-text">
            <div className="section-figure">
              <img {...bindImage(imageMap.floorOfMouth, "口腔底・舌下面の観察")} />
            </div>
            <div className="text-block">
              <p>(腫瘤・舌小帯短縮確認)</p>
            </div>
          </div>
          {renderQuestions([
            {
              text: "Okay, you can relax now.",
              content: (
                <>
                  {/* はい、楽にしてください。 */}
                  <b>Okay, you can relax now</b>{" "}
                  <span className="paraphrase">
                    (you can rest now)
                  </span>
                  .
                </>
              ),
            },
          ])}
        </Section>

        <Section title="硬口蓋の観察 (Observation of Hard Palate)" level={3}>
          {renderQuestions([
            // "では、今度は口を軽く開けて、軽く上を向いてください。(硬口蓋確認)"
            "Now please open your mouth slightly and look up a little.",
          ])}
        </Section>

        <Section title="軟口蓋・咽頭後壁・口蓋扁桃の観察 (Observation of Soft Palate, Posterior Pharynx and Palatine Tonsils)" level={3}>
          {renderQuestions([
            // "ではこのヘラで舌を軽く押さえます。 気持ち悪かったらおっしゃってください。 「あー」といいましょう。(視野の確保) (軟口蓋・咽頭後壁：発赤・腫脹・リンパ濾胞腫大確認)"
            "I will gently press your tongue down with this depressor. If you feel nauseated, please let me know. Please say 'ah' so I can see the back of your throat clearly.",
          ])}
          <p>(口蓋扁桃：腫脹・左右差・発赤・白苔確認)</p>
        </Section>
      </Section>

      <Section title="唾液腺 (Salivary Glands)" level={2}>
        {renderQuestions([
          {
            text:
              "I will gently feel the salivary glands that produce saliva; please tell me if anything is painful.",
            content: (
              <>
                {/* 唾を作る唾液腺を触って診察します、痛かったりしたらおっしゃってください。 */}
                I will{" "}
                <b>gently feel the salivary glands</b>{" "}
                <span className="paraphrase">
                  (palpate the glands that make saliva)
                </span>
                ; please{" "}
                <b>tell me</b>{" "}
                <span className="paraphrase">
                  (let me know)
                </span>{" "}
                if anything is painful.
              </>
            ),
          },
        ])}
        <div className="figure-row">
          <div className="section-figure">
            <img {...bindImage(imageMap.salivary1, "唾液腺の全体像1")} />
          </div>
          <div className="section-figure">
            <img {...bindImage(imageMap.salivary2, "唾液腺の全体像2")} />
          </div>
        </div>
        <Section title="耳下腺の触診 (Palpation of Parotid Gland)" level={3}>
          <div className="section-figure">
            <img {...bindImage(imageMap.parotid, "耳下腺の触診")} />
          </div>
          <p>(圧痛・腫瘤確認)</p>
        </Section>
        <Section title="顎下腺の触診 (Palpation of Submandibular Gland)" level={3}>
          {renderQuestions([
            {
              text: "Please tuck your chin in slightly.",
              content: (
                <>
                  {/* 軽く顎を引いてください。 */}
                  Please{" "}
                  <b>tuck your chin in slightly</b>{" "}
                  <span className="paraphrase">
                    (slightly pull your chin back)
                  </span>
                  .
                </>
              ),
            },
          ])}
          <div className="section-figure">
            <img {...bindImage(imageMap.submandibular, "顎下腺の触診")} />
          </div>
          <p>(くりくり)</p>
        </Section>
      </Section>

        <Section title="頭頸部リンパ節 (Lymph Nodes)" level={2}>
          <div className="section-figure">
            <img {...bindImage(imageMap.lymph1, "頭頸部リンパ節")} />
          </div>
          {renderQuestions([
            // "次に頭と頸のリンパ節を診察していきます。"
            "Next, I will examine the lymph nodes in your head and neck.",
          ])}
          {renderQuestions([
            // "痛かったらおっしゃってください。"
            "Please let me know if anything is painful.",
          ])}
          <div className="section-figure">
            <img {...bindImage(imageMap.lymph2, "頭頸部リンパ節")} />
          </div>
          {renderQuestions([
            // "軽く顎を引いてください。"
            "Please tuck your chin in slightly.",
          ])}
        <div className="figure-row">
          <div className="section-figure">
            <img {...bindImage(imageMap.lymph3, "頭頸部リンパ節")} />
          </div>
          <div className="section-figure">
            <img {...bindImage(imageMap.lymph4, "頭頸部リンパ節")} />
          </div>
        </div>
          <p>(圧痛→感染・膠原病、非圧痛硬腫大→悪性腫瘍)</p>

        <Section title="鎖骨上窩リンパ節 (Supraclavicular Nodes)" level={3}>
          <div className="section-figure">
            <img {...bindImage(imageMap.supraclavicular, "鎖骨上窩リンパ節")} />
          </div>
        </Section>

        <Section title="その他のリンパ節 (Other Lymph Nodes)" level={3}>
          <p>省略</p>
        </Section>
      </Section>

      <Section title="甲状腺 (Thyroid Gland)" level={2}>
        <div className="section-figure">
          <img {...bindImage(imageMap.thyroidOverview, "甲状腺全体")} />
        </div>

        <Section title="甲状腺の視診 (Inspection of Thyroid)" level={3}>
          {renderQuestions([
            // "次に頸の前にある甲状腺というところの診察をします。"
            "Next, I will examine your thyroid gland at the front of your neck.",
            // "まず、唾を飲んでみてください。"
            "First, please swallow.",
          ])}
          <div className="section-figure">
            <img {...bindImage(imageMap.thyroidInspect, "甲状腺の視診")} />
          </div>
          <p>(輪状軟骨の位置確認)</p>
          <p>(腫大確認)</p>
        </Section>

        <Section title="甲状腺峡部・葉部の触診 (Palpation of Thyroid Isthmus and Lobes)" level={3}>
          <p>(甲状腺峡部を基準に葉部を触りながら)</p>
          {renderQuestions([
            // "もう一度唾を飲んでみてください。"
            "Please swallow once more.",
          ])}
          <div className="section-figure">
            <img {...bindImage(imageMap.thyroidPalpation, "甲状腺峡部・葉部の触診")} />
          </div>
          <p>(硬さ、大きさ確認)</p>
        </Section>

        <Section title="甲状腺の聴診 (Auscultation of Thyroid)" level={3}>
          <div className="section-figure">
            <img {...bindImage(imageMap.thyroidAuscultation, "甲状腺の聴診")} />
          </div>
          <p>(雑音→甲状腺腫を疑う)</p>
        </Section>
      </Section>

      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          className="auth-button auth-button-primary"
          onClick={() => setShowLegacy((prev) => !prev)}
        >
          {showLegacy ? "旧版を閉じる" : "旧版を表示"}
        </button>
        <Link to="/head-neck/old" className="back-link">
          旧版を別ページで開く
        </Link>
      </div>

      {showLegacy && (
        <Section title="旧版（Head &amp; Neck legacy）" level={2} fullWidth>
          <PageIframe src={legacyUrl} title="頭頸部診察（旧版）" />
        </Section>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt={lightbox.alt} />
          <p className="lightbox-caption">クリックで閉じる</p>
        </div>
      )}
    </div>
  );
};

export default HeadNeckPage;
