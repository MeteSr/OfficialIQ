// The NCAA rule book editions the app imports (men's basketball and
// football). The PDFs are the NCAA's own downloads; each is pinned by
// SHA-256 to the file that was reviewed (the word-for-word checks passing
// and every line-end hyphen settled). When the NCAA posts a new file the
// import refuses it until it is reviewed the same way and pinned here.

const S3 = "https://ncaaorg.s3.amazonaws.com/championships/sports";

export const LEVELS = [{ id: "varsity", displayName: "Varsity" }, { id: "collegiate", displayName: "Collegiate" }];

export const EDITIONS = [
  {
    sportId: "ncaa_basketball",
    displayName: "NCAA Men's Basketball",
    rulebookYear: "2026-27",
    season: "2026-27",
    examName: "NCAA Men's Basketball Certification Exam",
    books: {
      rules: {
        title: "2026-27 NCAA Men's Basketball Rules Book",
        url: `${S3}/basketball/rules/men/PRMBB_RulesBook.pdf`,
        sha256: "9d1d8cbca3fe6d638a72f3fefc3d6b2a0cc93b38f2a171cda057a3d8729544a4",
      },
      caseBook: {
        title: "2026-27 NCAA Men's Basketball Case Book",
        url: `${S3}/basketball/rules/men/PRMBB_CaseBook.pdf`,
        sha256: "82e09e65a4a644be0bcf27e2d20ca537540896445771c8e21f942ace3b23bba9",
      },
    },
  },
  {
    sportId: "ncaa_football",
    displayName: "NCAA Football",
    rulebookYear: "2026",
    // The 2026 season, played in the app's 2026-27 season (August to July).
    season: "2026-27",
    examName: "NCAA Football Certification Exam",
    books: {
      rules: {
        title: "2026 NCAA Football Rules Book",
        url: `${S3}/football/rules/PRMFB_RulesBook.pdf`,
        sha256: "2a9e63b038b6efc70ad846487f33fdda175993c2229c911c3e06291ec74a9dd5",
      },
      // Its play situations are Rule 12's (instant replay) rulings.
      caseBook: {
        title: "2026 NCAA Football Instant Replay Case Book",
        url: `${S3}/football/rules/PRMFB_CaseBook.pdf`,
        sha256: "fbe7f29d9ec5044057de7e6e2fd452c161b298994d44dbc86c8f68297f8a6b84",
      },
    },
  },
];
