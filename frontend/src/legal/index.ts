// Privacy policy and terms of use, shown at /privacy and /terms
// (src/pages/LegalPage.tsx) and linked from the stores' listings.
//
// DRAFT. Written by Claude from what the app actually stores and sends, for
// Mete (and ideally a lawyer) to review. Before submitting to the stores:
// fill in every [bracketed] field below, read both documents through, and
// set LEGAL_DRAFT to false so the "Draft" banner goes away. The text is
// English only; Spanish readers see a note saying so.

export const LEGAL_DRAFT = true;

export const LEGAL = {
  operator: "[Legal name of the company or person operating OfficialIQ]",
  contactEmail: "[privacy contact email]",
  effectiveDate: "[effective date]",
  governingLaw: "[state or country whose law governs these terms]",
};

export type LegalSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type LegalDoc = { title: string; sections: LegalSection[] };

const { operator, contactEmail, governingLaw } = LEGAL;

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  sections: [
    {
      heading: "Who we are",
      paragraphs: [
        `OfficialIQ is a study, quiz and certification app for sports officials, run by ${operator} ("we"). This policy explains what the app collects, why, who it is shared with, and how to delete it. Questions: ${contactEmail}.`,
      ],
    },
    {
      heading: "How you sign in",
      paragraphs: [
        "You sign in with Internet Identity, which is run by the DFINITY Foundation, not by us. We never see a password, email address or phone number. Internet Identity gives the app a random identifier (a \"principal\") that is unique to OfficialIQ, and that identifier is how the app knows which data is yours.",
      ],
    },
    {
      heading: "What the app stores",
      paragraphs: ["The app stores the following on the Internet Computer, in software (\"canisters\") we control:"],
      bullets: [
        "Your profile: the display name you choose, sport, level, state and language.",
        "Your study and test history: answers, scores, rule-by-rule progress, spaced-review schedule, streaks and rating.",
        "What you do with others: friends you add, study groups, challenges, associations you join and the assignments you complete there, exam results you share with a mentor and their notes, and report cards you create or share.",
        "Things you enter: upcoming games, assigning-platform account ids you link, reports you send about questions, and links to video clips you submit.",
        "If you turn on notifications: a push token or subscription for your phone or browser.",
        "If the app hits an error: what went wrong, on which screen, the app version and whether it is the website or the Android or iOS app. Error reports don't include who you are; the app removes identifiers from them before sending.",
      ],
    },
    {
      heading: "What other people can see",
      paragraphs: [
        "Leaderboards show your display name, state, rating, accuracy, speed and streak to other users. Group members see your name and weekly accuracy in that group. Association coordinators see the assignments you complete and your exam history for that association. A mentor sees the exam answers you choose to share with them. A report card is visible to others only if you share it or make it public. Everything else is visible only to you.",
      ],
    },
    {
      heading: "Who we share data with",
      paragraphs: ["We don't sell your data, show ads, or use third-party analytics or advertising trackers. Data leaves the app only as follows:"],
      bullets: [
        "AI features (rule assistant, practice drills): the question you type, or the rule areas a drill should cover, is sent to Anthropic's Claude API to write the answer. Anthropic processes it under its commercial terms and doesn't use it to train its models.",
        "Notifications: the notification text is sent through Apple Push Notification service, Firebase Cloud Messaging (Google) or your browser's push service, to reach your device.",
        "The Internet Computer: the app's canisters run on independent node providers' machines, which hold the canisters' data in order to run them.",
        "When the law requires it.",
      ],
    },
    {
      heading: "On this device",
      paragraphs: [
        "The app keeps rule content, audio you download and unsent answers on your device so it works offline, plus your language and theme. You can clear downloads from the Me tab.",
      ],
    },
    {
      heading: "Deleting your account",
      paragraphs: [
        "Open Me → Delete account, in the app or on the website. Your profile is deleted at once and the rest of your data within minutes. Associations you coordinate and groups you own are deleted with your account. A few things stay because they aren't about you: question-by-question answer counts (which show how many officials missed a question, without saying who), and a video clip you submitted that was already added to a casebook play, which stays without your name on it. Before each app update we keep one backup copy of each canister for a rollback; that copy is replaced at the next update.",
        "Your Internet Identity is separate and stays yours. You can manage it at id.ai.",
      ],
    },
    {
      heading: "Children",
      paragraphs: [
        "OfficialIQ is for officials aged 13 and over. We don't knowingly collect data from children under 13; if you believe a child has an account, contact us and we will delete it.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        `Depending on where you live, you may have the right to see, correct, export or delete your data, and to object to how we use it. Most of this you can do in the app; for anything else, email ${contactEmail}.`,
      ],
    },
    {
      heading: "Changes",
      paragraphs: ["If this policy changes in a way that matters, we'll say so in the app before the change takes effect."],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: "Terms of Use",
  sections: [
    {
      heading: "Agreement",
      paragraphs: [
        `These terms are between you and ${operator}. By using OfficialIQ you agree to them. If you don't agree, don't use the app.`,
      ],
    },
    {
      heading: "What OfficialIQ is, and isn't",
      paragraphs: [
        "OfficialIQ helps you study officiating rules. It is not an official rulebook, and it doesn't certify you with any governing body or assigning organization. Rule summaries, questions, AI answers and practice exams can contain mistakes: on the court or field, the current official rulebook and your assigning body's interpretations always win. If you find a wrong question, please report it in the app.",
      ],
    },
    {
      heading: "Your account",
      paragraphs: [
        "You're responsible for what happens under your sign-in. Choose a display name that isn't offensive and doesn't pretend to be someone else, since other officials see it on leaderboards.",
      ],
    },
    {
      heading: "Fair play",
      paragraphs: ["Don't:"],
      bullets: [
        "use scripts, bots or multiple accounts to raise your rating or streak, or to win challenges;",
        "share or copy question banks or exam content outside the app;",
        "try to break, overload or get around the app's limits or security;",
        "submit video clips or reports that are unlawful, abusive, or that you don't have the right to share.",
      ],
    },
    {
      heading: "Content",
      paragraphs: [
        "The app's rule content, questions and design belong to us or to the rights holders who license them to us. You may use them for your own study. When you submit something, like a clip link or a question report, you let us use it to run and improve OfficialIQ.",
      ],
    },
    {
      heading: "Changes and availability",
      paragraphs: [
        "We may change, pause or stop features, and we may suspend accounts that break these terms. We'll try to give notice of big changes in the app.",
      ],
    },
    {
      heading: "No warranty",
      paragraphs: [
        "OfficialIQ is provided \"as is\". To the extent the law allows, we make no promises that it will be error-free or always available, and we aren't liable for indirect losses, or for decisions made on the basis of content in the app.",
      ],
    },
    {
      heading: "Law and contact",
      paragraphs: [`These terms are governed by the laws of ${governingLaw}. Questions: ${contactEmail}.`],
    },
  ],
};
