export type QAItem = {
  slug?: string; // audio slug (optional)
  question: string;
  answer: string;
};

export type QASection = {
  title: string;
  items: QAItem[];
};

// 英語面接（血液腫瘍内科）: 音声付き
export const englishHemeOncQA: QASection[] = [
  {
    title: "Motivation & Fit",
    items: [
      {
        slug: "why-heme-onc",
        question: "Why do you want to pursue hematology and oncology?",
        answer:
          "I am drawn to <strong>hematology and oncology</strong> because it combines long-term patient relationships with rapidly evolving science. I want to help patients navigate complex therapies while contributing to clinical research that improves survival and quality of life.",
      },
      {
        slug: "future-goals",
        question: "Where do you see your career in five to ten years?",
        answer:
          "I aim to be a <strong>hematology-oncology</strong> fellow focusing on <strong>acute leukemia</strong> at an academic center, leading clinical trials that integrate <strong>measurable residual disease</strong> into treatment decisions while maintaining strong bedside communication skills.",
      },
    ],
  },
  {
    title: "Communication & Ethics",
    items: [
      {
        slug: "break-bad-news",
        question: "How do you approach delivering bad news to a patient with cancer?",
        answer:
          "I use a structured approach like <strong>SPIKES</strong>: setting up the conversation, assessing the patient's perception, inviting their preferences, giving knowledge plainly, responding with empathy, and summarizing a plan. I prioritize clarity, allow silence, and check understanding repeatedly.",
      },
      {
        slug: "ethics",
        question: "How would you handle an ethical dilemma about aggressive treatment near end of life?",
        answer:
          "I explore the patient's goals, clarify prognosis honestly, and offer time-limited trials when appropriate. If burdens outweigh benefits, I recommend focusing on comfort while honoring the patient's values and involving <strong>palliative care</strong> early.",
      },
    ],
  },
  {
    title: "Teamwork & Leadership",
    items: [
      {
        slug: "strengths-leadership",
        question: "What is your key strength, and how would you apply it in oncology?",
        answer:
          "My key strength is calm leadership in uncertainty. On rounds I state the clinical priorities, delegate tasks, and keep communication open with nursing and pharmacy so <strong>chemotherapy</strong>, <strong>transfusions</strong>, and prophylaxis happen safely and on time.",
      },
      {
        slug: "teamwork",
        question: "How do you collaborate with a multidisciplinary team?",
        answer:
          "I clarify goals early, summarize decisions aloud, and document them. For complex cases like <strong>stem cell transplant</strong> or <strong>CAR-T</strong>, I ensure hematology, infectious disease, pharmacy, and social work align on prophylaxis, monitoring, and discharge plans.",
      },
    ],
  },
  {
    title: "Clinical Judgment & Safety",
    items: [
      {
        slug: "patient-safety",
        question: "Describe a time you prevented a safety issue.",
        answer:
          "On hematology service I checked a <strong>febrile neutropenia</strong> patient whose <strong>ANC</strong> had fallen; empirical antibiotics had not been started. I escalated to the resident and nurse, ordered cultures, started broad-spectrum antibiotics, and documented the rationale, preventing delay.",
      },
      {
        slug: "resilience",
        question: "How do you cope with stress or difficult outcomes?",
        answer:
          "I debrief with the team, reflect on what is controllable, and keep a routine of sleep and exercise. I review cases with mentors to learn and use structured checklists to avoid errors when fatigued.",
      },
    ],
  },
  {
    title: "Research & Teaching",
    items: [
      {
        slug: "research-focus",
        question: "What research interests do you have in hematology/oncology?",
        answer:
          "I am interested in translational research on <strong>minimal residual disease</strong> in <strong>acute leukemia</strong>. I want to study how measurable residual disease guides risk-adapted therapy and post-remission strategies such as transplant or maintenance.",
      },
      {
        slug: "teaching",
        question: "How do you teach juniors or patients?",
        answer:
          "For trainees, I keep teaching points to one or two high-yield items, like <strong>neutropenia prophylaxis</strong> or <strong>tumor lysis</strong> monitoring, and ask for a teach-back. For patients, I use plain language, written handouts, and confirm understanding.",
      },
    ],
  },
];

// 日本語面接（一般）
export const japaneseInterviewQA: QASection[] = [
  {
    title: "アイスブレイク・経歴",
    items: [
      {
        question: "地元や趣味などでアイスブレイクをしてください。",
        answer: "（地元や最近の出来事を一言で）",
      },
      {
        question: "高校・大学などの経歴を簡潔に説明してください。",
        answer: "（年次・専攻・活動をシンプルに要約）",
      },
    ],
  },
  {
    title: "動機・価値観",
    items: [
      {
        question: "医師を志望した理由を教えてください。",
        answer: "（原体験→学び→これからの貢献を一息で）",
      },
      {
        question: "あなたの強みは何ですか？",
        answer: "（強み→具体例→面接先での活かし方）",
      },
    ],
  },
  {
    title: "最近の興味",
    items: [
      {
        question: "最近読んだ本や映画で印象的だったものは？理由は？",
        answer: "（作品名→ポイント1→学び/感想を一言）",
      },
    ],
  },
];

// 医療面接（お悩み相談）: 情報共有と合意形成の流れ
export const consultInterviewQA: QASection[] = [
  {
    title: "情報共有の入り方",
    items: [
      {
        question: "ご家族への情報共有をどう始めますか？",
        answer:
          "「まず現状を共有させてください。そのうえで、ご不安や疑問点を一つずつ整理しましょう。」",
      },
      {
        question: "わかりにくい部分を確認するフレーズは？",
        answer:
          "「ここまでで不明な点や、納得しきれていない部分はありますか？」",
      },
    ],
  },
  {
    title: "治療方針と価値観のすり合わせ",
    items: [
      {
        question: "治療の選択肢を提示する際の伝え方は？",
        answer:
          "「考えられる選択肢はAとBです。メリットと負担をそれぞれ率直にお伝えしますので、ご家族の希望を伺わせてください。」",
      },
      {
        question: "患者さん・家族の価値観を引き出す質問は？",
        answer:
          "「治療で優先したいことは何でしょうか。延命、苦痛の緩和、ご自宅での生活など、率直に教えてください。」",
      },
    ],
  },
  {
    title: "次のステップと合意形成",
    items: [
      {
        question: "合意形成に向けてのまとめ方は？",
        answer:
          "「今日は〇〇を共有し、□□で合意しました。次回までに追加で確認したいことがあれば教えてください。」",
      },
      {
        question: "サポート体制に言及する一言は？",
        answer:
          "「緩和ケアチームやソーシャルワーカーとも連携して、ご家族を含めて支えていきます。」",
      },
    ],
  },
];
