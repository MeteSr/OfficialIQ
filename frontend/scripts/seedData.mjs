// Original practice content for NCAA Men's Basketball officiating study.
// Written from scratch for OfficialIQ — not copied from any NCAA publication.
// Replace with licensed rulebook/casebook text before a real launch (see issue #1).

export const SPORT_ID = "ncaa_basketball";
export const LEVEL_ID = "varsity";

// players: [[id, x, y, shortLabel, role], ...] — x/y are 0-100 court percentages.
// arrows: [[fromId, toId, style], ...] — style is "solid" or "dashed".
function diagram(players, arrows = []) {
  return {
    players: players.map(([id, x, y, shortLabel, role]) => ({ id, x, y, shortLabel, role })),
    arrows: arrows.map(([fromId, toId, style]) => ({ fromId, toId, style })),
  };
}

function q(stem, choices, correctId, explanation, difficulty, opts = {}) {
  return {
    stem,
    choices: choices.map(([id, text]) => ({ id, text })),
    correctId,
    explanation,
    difficulty,
    isCasebook: !!opts.isCasebook,
    isPointOfEmphasis: !!opts.isPointOfEmphasis,
    citation: opts.citation ?? null,
  };
}

export const ARTICLES = [
  {
    number: 1,
    title: "Court and Equipment",
    body:
      "The playing court is a rectangular surface free of obstructions, bounded by clearly marked boundary lines, with a designated three-point line, lane markings, and a center circle used for the opening jump ball. The game ball must meet approved size, weight, and pressure standards, and both baskets must be mounted at a uniform, regulation height. Officials are responsible for inspecting the court and equipment before tip-off and for reporting any condition that could create an unsafe or unfair playing environment, including torn nets, loose padding, or an improperly inflated ball.",
    plays: [
      {
        citation: "Art. 1-3, Case 1",
        scenario:
          "During pregame inspection, the referee notices the shot clock at one end of the court is not synchronized with the game clock's horn.",
        ruling:
          "The referee must have the malfunction corrected before the game begins; if it cannot be fixed, the crew notifies both coaches and uses the backup timing procedure outlined in the game administration plan.",
      },
      {
        citation: "Art. 1-6, Case 1",
        scenario:
          "A player reports to the table wearing a knee brace with exposed hard plastic edges.",
        ruling:
          "The equipment is illegal until the exposed hard surfaces are adequately padded; the player may not enter the game until the brace is covered.",
      },
    ],
    questions: [
      q("Who is responsible for inspecting the court and equipment before the game begins?",
        [["a","The head coach of the home team"],["b","The officiating crew"],["c","The scorer"],["d","The visiting team's captain"]],
        "b", "Pregame inspection of the court, baskets, and game ball is a referee responsibility.", "Beginner"),
      q("What should an official do if a basket is found to be at an incorrect height during warmups?",
        [["a","Ignore it since warmups don't count"],["b","Have it corrected before the game starts"],["c","Adjust it only if a team complains"],["d","Delay the game until the following day"]],
        "b", "Equipment problems discovered pregame must be corrected before tip-off whenever possible.", "Beginner"),
      q("Which of the following is NOT a standard element of the playing court described in Art. 1?",
        [["a","A center circle"],["b","A three-point line"],["c","A designated coach's box painted at center court"],["d","Lane markings"]],
        "c", "A coach's box exists along the sideline, not at center court, and is not part of the court markings covered here.", "Intermediate"),
      q("A player's knee brace has an exposed metal hinge. What is the correct ruling?",
        [["a","Legal as long as it was prescribed by a doctor"],["b","Illegal until properly padded"],["c","Legal only in the second half"],["d","Illegal, and the player is charged a technical foul"]],
        "b", "Hard, unpadded surfaces on equipment are illegal regardless of medical necessity until adequately padded; no foul is assessed for simply arriving with the issue.", "Intermediate"),
      q("If the game ball is found to be under-inflated just before tip-off, who resolves the issue?",
        [["a","The head coach"],["b","The officiating crew, using an approved backup ball if needed"],["c","The scorer's table alone"],["d","The game is postponed"]],
        "b", "Officials handle equipment issues directly, substituting an approved ball rather than postponing the contest.", "Intermediate"),
      q("A team arrives with a ball that meets size and weight standards but has a noticeably different pebbled surface than the home team's ball. What governs which ball is used?",
        [["a","The home team always uses its own ball"],["b","Pregame procedure or conference policy designates the official game ball"],["c","The visiting team chooses"],["d","Whichever ball the referee prefers personally"]],
        "b", "Ball selection for the contest is governed by pregame procedure or conference policy, not individual preference.", "Advanced"),
      q("During the second half, a padded basket support is discovered to have shifted, partially exposing the base. What is the appropriate officiating response?",
        [["a","Play continues; it will be fixed at the next timeout"],["b","Stop play at the next dead ball and have it corrected immediately"],["c","Ignore it unless a player is injured"],["d","Award a technical foul to the home team for facility failure"]],
        "b", "A safety hazard discovered during play should be corrected at the next dead ball rather than waiting indefinitely.", "Advanced"),
      q("Which statement about the three-point line is most accurate for officiating purposes?",
        [["a","Its exact distance from the basket varies by conference preference"],["b","It is a fixed boundary used to determine two-point versus three-point field goals"],["c","It only applies in the second half"],["d","It is only relevant for free throws"]],
        "b", "The three-point line's primary officiating relevance is determining whether a made field goal counts for two or three points.", "Expert"),
      q("Case: A shot clock light/horn malfunctions mid-game with no backup timer available at that basket. What is the correct procedure?",
        [["a","Play stops immediately and the game is forfeited"],["b","Officials use visible/audible judgment or a designated backup method per the game administration plan until it is repaired"],["c","The shot clock rule is suspended for the remainder of the game"],["d","The offense is automatically awarded a new shot clock every possession"]],
        "b", "Malfunctioning equipment triggers the crew's backup procedure rather than stopping the rule's enforcement entirely.", "Advanced", { isCasebook: true, citation: "Art. 1-3, Case 1" }),
      q("Case: A player's knee brace is found to have an exposed hard edge only after they have already entered and played several possessions. What is the ruling?",
        [["a","A technical foul is assessed retroactively"],["b","The player must correct the equipment before returning; no penalty applies for the prior possessions"],["c","The team forfeits any points scored while the player was on the court"],["d","Nothing happens since the game already started"]],
        "b", "Once discovered, the equipment must be corrected before the player continues, but no retroactive penalty applies for time already played.", "Expert", { isCasebook: true, citation: "Art. 1-6, Case 1" }),
    ],
  },
  {
    number: 2,
    title: "Players, Substitutes, and Coaches",
    body:
      "Each team may dress a limited number of players in uniform, and only those listed on the pregame roster are eligible to participate. Substitutes must report to the scorer's table and be recognized by an official before entering the game, and they may only enter during a dead ball. Head coaches are responsible for the conduct of their bench personnel and may be held accountable for actions of players, assistant coaches, and other team followers seated in the team area. A player who has fouled out or been disqualified must leave the playing court promptly and take no further part in the contest.",
    plays: [
      {
        citation: "Art. 2-5, Case 1",
        scenario:
          "A substitute enters the court during a live ball after being waved in by the coach but without reporting to the table.",
        ruling:
          "This is an improper substitution; play is stopped, the substitute is directed back to the bench, and the game resumes with the appropriate procedure for the interruption.",
      },
      {
        citation: "Art. 2-8, Case 1",
        scenario:
          "A player who has fouled out remains seated on the bench in street clothes and shouts instructions to teammates during play.",
        ruling:
          "This is permitted; a disqualified player may remain on the bench in proper attire and may not return to play, but ordinary bench communication is not itself a violation.",
      },
    ],
    questions: [
      q("When may a substitute legally enter the game?",
        [["a","At any time, including while the ball is live"],["b","Only during a dead ball after being recognized by an official"],["c","Only at the start of a quarter"],["d","Only if the head coach signals the referee directly"]],
        "b", "Substitutions require a dead ball and official recognition after reporting to the table.", "Beginner"),
      q("Who is responsible for the conduct of a team's bench personnel?",
        [["a","The scorer"],["b","The head coach"],["c","The team captain only"],["d","No one; bench conduct is unregulated"]],
        "b", "Head coaches bear responsibility for the conduct of players and other team followers in the team area.", "Beginner"),
      q("What must a player who has fouled out do?",
        [["a","Remain in the game until the next timeout"],["b","Leave the playing court promptly and take no further part in the contest"],["c","Sit at the end of the bench but may re-enter in overtime"],["d","Finish the current possession before leaving"]],
        "b", "A disqualified player must leave the court and cannot return for the remainder of the game.", "Intermediate"),
      q("A team wants to substitute a player who was never listed on the pregame roster. What is the ruling?",
        [["a","Allowed if the coach explains the omission"],["b","Not allowed; only rostered players are eligible to participate"],["c","Allowed only in the second half"],["d","Allowed with a technical foul penalty"]],
        "b", "Only players on the official pregame roster are eligible to participate at all.", "Intermediate"),
      q("A substitute reports to the table and is recognized by an official, but the ball becomes live again before they physically step onto the court. What happens?",
        [["a","They may no longer enter until the next dead ball"],["b","They must wait until the next dead ball to enter, since substitutions occur during stoppages"],["c","They can enter immediately even with a live ball"],["d","The team is charged a technical foul"]],
        "b", "A recognized substitute still must wait for the appropriate dead-ball window to physically enter if timing does not align.", "Intermediate"),
      q("Which of the following best describes an assistant coach's standing to address officials during the game?",
        [["a","Assistant coaches may never speak to officials"],["b","Only the head coach, or a designated bench personnel member under conference rules, typically has standing to address officials on rule matters"],["c","Any bench personnel may argue calls freely"],["d","Only the team captain may address officials"]],
        "b", "Rule-related communication with officials is generally channeled through the head coach or a specifically designated person.", "Advanced"),
      q("A player is discovered, mid-game, to be ineligible due to a paperwork issue unrelated to on-court conduct. What is the general officiating approach?",
        [["a","Officials handle eligibility disputes directly during the game"],["b","Eligibility is an administrative matter typically resolved outside live officiating, though the player may be held out once flagged by proper authority"],["c","The team automatically forfeits at halftime"],["d","The referee bans the player from the arena"]],
        "b", "Eligibility disputes are generally an administrative matter, not something officials adjudicate live beyond following proper notification.", "Advanced"),
      q("Which statement about a disqualified player remaining on the bench is accurate?",
        [["a","They may remain on the bench in proper attire but cannot return to play"],["b","They must leave the arena entirely"],["c","They may return in the final minute of the game"],["d","They may coach from the bench with full authority"]],
        "a", "A disqualified player may stay on the bench appropriately dressed but is done playing for the game.", "Expert"),
      q("Case: A substitute enters live play after being waved in by the coach but without reporting to the table. What is the correct officiating response?",
        [["a","Allow play to continue; no rule was broken"],["b","Stop play, treat it as an improper substitution, and direct the player back to the bench"],["c","Immediately eject the substitute"],["d","Award a technical foul with no stoppage"]],
        "b", "An improper substitution is corrected by stopping play and returning the player to the bench, following the proper restart procedure.", "Advanced", { isCasebook: true, citation: "Art. 2-5, Case 1" }),
      q("Case: A fouled-out player remains on the bench in street clothes and calls out instructions to teammates. Is this a violation?",
        [["a","Yes, any communication from a disqualified player is prohibited"],["b","No, ordinary bench communication is permitted as long as the player does not return to play"],["c","Yes, but only if the coach allows it"],["d","No, but only during timeouts"]],
        "b", "Bench communication from a properly seated disqualified player is not itself prohibited.", "Expert", { isCasebook: true, citation: "Art. 2-8, Case 1" }),
    ],
  },
  {
    number: 3,
    title: "Officials, Duties, and Table Personnel",
    body:
      "A game crew typically consists of on-court officials who administer play and a table crew who manage the scorebook, game clock, and shot clock. On-court officials have authority to make judgment calls on violations and fouls, to administer throw-ins and free throws, and to resolve disputes about the correct procedure following an interruption. Table personnel are responsible for accurately recording scoring, fouls, and time, and for signaling officials when a discrepancy needs to be addressed. Officials retain final authority over all matters of fact and judgment once the game has started.",
    plays: [
      {
        citation: "Art. 3-4, Case 1",
        scenario:
          "The scorer notices a player has been credited with a sixth personal foul but the official at the table did not signal a disqualification.",
        ruling:
          "The scorer must promptly notify the official crew; once confirmed, the player is disqualified and the correction is made even though play may have already resumed briefly.",
      },
      {
        citation: "Art. 3-6, Case 1",
        scenario:
          "The game clock operator inadvertently starts the clock a full second early on a throw-in.",
        ruling:
          "Officials have authority to correct an obvious timing error using their own judgment and, where available, a game clock readout or video review process permitted by the administration plan.",
      },
    ],
    questions: [
      q("Who has final authority over judgment calls once the game has started?",
        [["a","The head coach"],["b","The on-court officials"],["c","The scorer"],["d","The home team's athletic director"]],
        "b", "On-court officials retain final authority over judgment calls during the game.", "Beginner"),
      q("What is the scorer primarily responsible for?",
        [["a","Making foul calls"],["b","Accurately recording scoring, fouls, and time"],["c","Substitutions on the floor"],["d","Selecting the game ball"]],
        "b", "The scorer's role is administrative record-keeping, not making calls.", "Beginner"),
      q("If table personnel notice a scorebook discrepancy, what should they do?",
        [["a","Correct it silently without telling anyone"],["b","Signal the officials so it can be addressed"],["c","Wait until after the game to mention it"],["d","Ignore it if the game is close"]],
        "b", "Table personnel are expected to flag discrepancies to officials promptly.", "Intermediate"),
      q("A player is discovered to have committed a disqualifying foul that was not announced. What is the correct procedure?",
        [["a","Nothing changes since play already continued"],["b","The crew is notified, and the player is disqualified once confirmed"],["c","The next foul against that player is simply ignored"],["d","The game is replayed from the start"]],
        "b", "A missed disqualification is corrected as soon as it is discovered and confirmed.", "Intermediate"),
      q("Who is generally responsible for operating the shot clock?",
        [["a","An on-court official"],["b","Designated table personnel"],["c","The head coach's staff"],["d","No one; shot clocks are automatic"]],
        "b", "The shot clock is operated by table personnel as part of the game administration crew.", "Intermediate"),
      q("An obvious game clock timing error occurs on a throw-in. Who has authority to correct it?",
        [["a","Only the home team's administration"],["b","The officiating crew, using their judgment and available tools"],["c","No one; clock errors are irreversible once play continues"],["d","Only the visiting coach may request a correction"]],
        "b", "Officials may correct clearly erroneous timing using their judgment and any permitted review tools.", "Advanced"),
      q("What best describes the relationship between on-court officials and table personnel during a disputed sequence?",
        [["a","Table personnel make the final ruling"],["b","On-court officials retain final authority, informed by information from the table"],["c","The head coach breaks any tie"],["d","The crew chief from the previous game is consulted"]],
        "b", "Officials use table information but retain the final decision-making authority.", "Advanced"),
      q("Which of the following is an appropriate use of a game administration review process, where permitted?",
        [["a","Reviewing a judgment call on a shooting foul's severity"],["b","Confirming a clearly erroneous clock or scoring error"],["c","Overturning a coach's disagreement with a foul call"],["d","Determining which team wins the opening tip"]],
        "b", "Review processes are generally limited to confirming clear, objective errors rather than re-litigating judgment calls.", "Expert"),
      q("Case: The scorebook shows a player's sixth foul, but no disqualification was signaled at the time. What is the correct fix?",
        [["a","No correction is made since the moment has passed"],["b","The crew is notified, confirms the record, and disqualifies the player going forward"],["c","The team is penalized with a technical foul for the record-keeping error"],["d","The player is disqualified retroactively, erasing points scored since the sixth foul"]],
        "b", "The player is disqualified once the discrepancy is confirmed; retroactive erasure of the intervening play is not standard.", "Advanced", { isCasebook: true, citation: "Art. 3-4, Case 1" }),
      q("Case: The clock operator starts the game clock a full second early on a throw-in. What is the appropriate response?",
        [["a","Officials ignore small timing errors"],["b","Officials use judgment and available tools to correct the obvious error"],["c","The throw-in team automatically loses possession"],["d","The half is restarted"]],
        "b", "Clearly erroneous timing is correctable through officials' judgment and available administrative tools.", "Expert", { isCasebook: true, citation: "Art. 3-6, Case 1" }),
    ],
  },
  {
    number: 4,
    title: "Scoring and Timing",
    body:
      "A field goal counts for two points when made from within the three-point line and three points when made from beyond it; a free throw counts for one point. The game clock runs continuously during live-ball play and stops on specified dead-ball situations such as fouls, violations, and certain out-of-bounds calls. Each half is divided into timed periods, and possession alternates based on established procedures at the start of extra periods. The shot clock limits the time an offensive team may hold the ball before attempting a try for goal, and it resets according to specific triggering events such as a change of team control or an offensive rebound.",
    plays: [
      {
        citation: "Art. 4-2, Case 1",
        scenario:
          "A player releases a try for goal from beyond the three-point line just before the shot clock horn sounds, and the ball goes through the basket after the horn.",
        ruling:
          "If the ball left the shooter's hand before the shot clock expired, the goal counts for three points; the shot clock horn alone does not negate a try already released in time.",
        diagram: diagram([
          ["O1", 85, 52, "O1", "Shooter — releases from beyond the three-point line just before the horn"],
          ["D1", 80, 50, "D1", "Defender — closing out on the shooter"],
        ]),
      },
      {
        citation: "Art. 4-5, Case 1",
        scenario:
          "The offensive team gains a new period of team control after a loose-ball foul on the defense, but the table forgets to reset the shot clock.",
        ruling:
          "Once discovered, officials direct the table to correct the shot clock to the proper time appropriate to the restart, rather than allowing the uncorrected clock to stand.",
      },
    ],
    questions: [
      q("How many points is a successful free throw worth?",
        [["a","One"],["b","Two"],["c","Three"],["d","Zero"]],
        "a", "A free throw is worth one point.", "Beginner"),
      q("When does the game clock generally stop?",
        [["a","Only at the end of each quarter"],["b","On specified dead-ball situations such as fouls and violations"],["c","Never, except at halftime"],["d","Only when a team calls a timeout"]],
        "b", "The clock stops on defined dead-ball events, not continuously.", "Beginner"),
      q("What determines whether a made basket is worth two or three points?",
        [["a","The time remaining on the clock"],["b","Whether the shooter's foot was behind the three-point line at the moment of release"],["c","The player's jersey number"],["d","Whether it was an assisted basket"]],
        "b", "Shot value depends on the shooter's position relative to the three-point line at release.", "Intermediate"),
      q("What is the primary purpose of the shot clock?",
        [["a","To track the total game time"],["b","To limit how long the offense may hold the ball before attempting a try"],["c","To determine free throw eligibility"],["d","To signal substitutions"]],
        "b", "The shot clock restricts the offense's time to attempt a shot.", "Intermediate"),
      q("A try for goal is released before the shot clock horn but is still in the air when the horn sounds. What is the ruling if it goes in?",
        [["a","The basket does not count"],["b","The basket counts if it left the shooter's hand before the horn"],["c","The basket counts only as a two-point shot regardless of distance"],["d","Play is replayed from the point of release"]],
        "b", "Release timing, not the horn itself, governs whether the goal counts.", "Advanced"),
      q("Under what circumstance does the shot clock typically reset to a full new period?",
        [["a","Any dead ball whatsoever"],["b","A change of team control, such as a defensive rebound or steal"],["c","Every made basket, regardless of team"],["d","Only at the start of a new quarter"]],
        "b", "A change of team control is the standard trigger for a full shot clock reset.", "Advanced"),
      q("If the shot clock is not properly reset after a change of team control and the error is discovered promptly, what should happen?",
        [["a","Nothing; the clock stands as shown"],["b","Officials direct the table to correct it to the proper time"],["c","The team gains an automatic point"],["d","The game is replayed from the previous quarter"]],
        "b", "A discovered clock administration error is corrected by the table under official direction.", "Advanced"),
      q("Which of the following best describes possession procedures at the start of an overtime period?",
        [["a","The team that scored last automatically gets the ball"],["b","Possession follows the established procedure the rules define for extra periods, separate from the opening tip"],["c","Another jump ball is always used for every overtime"],["d","The visiting team always starts with the ball"]],
        "b", "Extra periods follow a defined possession procedure rather than being decided informally.", "Expert"),
      q("Case: A three-point try is released just before the shot clock horn and goes in after the horn sounds. What is the correct ruling?",
        [["a","No basket; the horn ends the possession"],["b","The three-point goal counts because it left the hand before expiration"],["c","It counts as a two-point goal instead"],["d","The officials must review it before deciding"]],
        "b", "Release timing controls; the goal counts for three points.", "Advanced", { isCasebook: true, citation: "Art. 4-2, Case 1" }),
      q("Case: After a loose-ball foul gives the offense a new team control period, the shot clock is not reset. What is the correct fix once noticed?",
        [["a","Play continues with the uncorrected clock"],["b","Officials direct the table to correct the shot clock to the proper time"],["c","The defense is awarded the ball"],["d","A technical foul is assessed to the table crew"]],
        "b", "The shot clock is corrected to reflect the proper restart once the omission is discovered.", "Expert", { isCasebook: true, citation: "Art. 4-5, Case 1" }),
    ],
  },
  {
    number: 5,
    title: "Live Ball, Dead Ball, and Put-in-Play Procedures",
    body:
      "The ball becomes live when it is at the disposal of a player for a throw-in or free throw, or when it leaves the official's hand on a jump ball toss. It becomes dead when a goal is made, a foul or violation occurs, an official's whistle sounds, or time expires while the ball is in flight for a try. Once the ball is dead, no player action can score or cause a violation until it is legally made live again. Understanding the precise moment the ball becomes live or dead is essential to correctly ruling on contact, out-of-bounds status, and shot clock expiration.",
    plays: [
      {
        citation: "Art. 5-2, Case 1",
        scenario:
          "A defender fouls an opponent a fraction of a second after the ball has already left the shooter's hand on a made basket.",
        ruling:
          "The basket counts because the try was released and the ball was still live at the moment of release; the foul is then administered separately according to normal procedure.",
        diagram: diagram([
          ["O1", 63, 15, "O1", "Shooter — releases the try before contact occurs"],
          ["D1", 60, 17, "D1", "Defender — fouls a fraction of a second after release"],
        ]),
      },
      {
        citation: "Art. 5-4, Case 1",
        scenario:
          "A player taps a loose ball into the basket after the officials' whistle has already sounded for an unrelated violation.",
        ruling:
          "The basket does not count because the ball was already dead at the moment of the whistle, regardless of what happens afterward.",
        diagram: diagram([
          ["O1", 47, 10, "O1", "Offense — taps a loose ball toward the basket after the whistle"],
          ["D1", 53, 12, "D1", "Defender — involved in the earlier violation that made the ball dead"],
        ]),
      },
    ],
    questions: [
      q("When does the ball become live on a throw-in?",
        [["a","When the referee blows the whistle"],["b","When it is at the disposal of the player taking the throw-in"],["c","When the defense sets up"],["d","When ten seconds have passed"]],
        "b", "A throw-in ball becomes live once it is at the thrower's disposal.", "Beginner"),
      q("Which of the following causes the ball to become dead?",
        [["a","A player dribbling near half court"],["b","A made goal"],["c","A player setting a screen"],["d","The offense calling a play"]],
        "b", "A made goal is one of the standard events that causes the ball to become dead.", "Beginner"),
      q("If a foul occurs just after a shooter releases a try that goes in, what happens to the basket?",
        [["a","It never counts because a foul occurred"],["b","It counts because the ball was released while live"],["c","It counts only if the shooter makes the resulting free throw"],["d","It is replayed"]],
        "b", "Release timing governs; the basket counts and the foul is handled separately.", "Intermediate"),
      q("What is the significance of the exact moment the ball becomes dead?",
        [["a","It has no real significance"],["b","No further scoring or violation can occur until it is legally made live again"],["c","It only matters for free throws"],["d","It only affects the shot clock, not scoring"]],
        "b", "The dead-ball moment is a hard boundary for what can and cannot count afterward.", "Intermediate"),
      q("A player taps a loose ball toward the basket after the whistle has already blown for an unrelated call. If it goes in, does it count?",
        [["a","Yes, since the ball was already in motion"],["b","No, because the ball was already dead when the whistle sounded"],["c","Yes, but only for one point"],["d","It depends on which team is ahead"]],
        "b", "Once dead, nothing that happens afterward can score, regardless of the ball's prior motion.", "Advanced"),
      q("On a jump ball, at what point does the ball become live?",
        [["a","When the two jumpers are in position"],["b","When it leaves the official's hand on the toss"],["c","When a player successfully taps it"],["d","When the shot clock starts"]],
        "b", "The toss leaving the official's hand is the live-ball moment for a jump ball.", "Intermediate"),
      q("Which scenario best illustrates why officials must precisely judge live/dead-ball timing?",
        [["a","Determining who dribbles the ball up the court"],["b","Determining whether a basket counts relative to a foul or whistle"],["c","Determining which team wears home jerseys"],["d","Determining the starting lineup"]],
        "b", "Scoring validity relative to fouls and whistles is the central reason precise timing judgment matters.", "Advanced"),
      q("If time expires while a try for goal is in flight, what governs whether the basket counts?",
        [["a","It never counts once time expires"],["b","It counts if the ball left the shooter's hand before time fully expired"],["c","It counts only in overtime"],["d","The head coach decides by protest"]],
        "b", "Release-before-expiration is again the controlling principle for a try in flight at the horn.", "Expert"),
      q("Case: A defender fouls a shooter a fraction of a second after the ball leaves their hand on a made basket. What is the ruling?",
        [["a","The basket is waved off entirely"],["b","The basket counts, and the foul is administered separately"],["c","The basket counts for one point only"],["d","The possession is replayed"]],
        "b", "The made basket stands because release occurred while the ball was live; the foul is a separate matter.", "Advanced", { isCasebook: true, citation: "Art. 5-2, Case 1" }),
      q("Case: A player taps a loose ball into the basket just after an official's whistle for an unrelated violation. Does the basket count?",
        [["a","Yes, tap-ins always count"],["b","No, the ball was already dead when the whistle sounded"],["c","Yes, but the points are awarded to the other team"],["d","It counts only if the violation is declined"]],
        "b", "The whistle made the ball dead before the tap-in occurred, so it cannot count.", "Expert", { isCasebook: true, citation: "Art. 5-4, Case 1" }),
    ],
  },
  {
    number: 6,
    title: "Out-of-Bounds and Throw-Ins",
    body:
      "The ball is out of bounds when it touches a boundary line, an object, or a person who is out of bounds, or when it touches a player who is themselves out of bounds. The team that did not cause the ball to go out of bounds is awarded a throw-in at the nearest appropriate spot. A player taking a throw-in must release the ball within the allotted time and may not step onto the court while holding the ball, though they may move along the designated boundary within limits. Officials must correctly identify both the location of the throw-in and which team caused the ball to go out of bounds.",
    plays: [
      {
        citation: "Art. 6-3, Case 1",
        scenario:
          "A defender deflects a pass that goes out of bounds off a different defender before leaving the court.",
        ruling:
          "The ball is awarded to the offense for a throw-in because the last team to touch the ball before it went out was the defense.",
        diagram: diagram([
          ["O1", 20, 60, "O1", "Passer — throws toward a teammate"],
          ["O2", 75, 55, "O2", "Intended receiver"],
          ["D1", 45, 58, "D1", "Defender — first deflection"],
          ["D2", 65, 50, "D2", "Defender — second deflection; ball goes out of bounds off him"],
        ], [
          ["O1", "D1", "solid"],
          ["D1", "D2", "dashed"],
        ]),
      },
      {
        citation: "Art. 6-5, Case 1",
        scenario:
          "A player taking a throw-in steps onto the playing court while still holding the ball, then steps back before releasing it.",
        ruling:
          "This is a throw-in violation; the ball is awarded to the opposing team for a throw-in at the same spot.",
        diagram: diagram([
          ["O1", 10, 90, "O1", "Thrower — steps onto the court while holding the ball, then steps back"],
          ["D1", 25, 88, "D1", "Defender — nearest the throw-in spot"],
        ]),
      },
    ],
    questions: [
      q("When is the ball considered out of bounds?",
        [["a","Only when a player is holding it out of bounds"],["b","When it touches a boundary line, an out-of-bounds object, or an out-of-bounds player"],["c","Only when it bounces twice"],["d","Only when the official calls a timeout"]],
        "b", "Multiple conditions define out-of-bounds status for the ball, not just player possession.", "Beginner"),
      q("Which team is awarded the throw-in after the ball goes out of bounds?",
        [["a","The team that last touched it before it went out"],["b","The team that did not cause it to go out of bounds"],["c","Whichever team is losing"],["d","The home team, by default"]],
        "b", "Possession goes to the team not responsible for sending the ball out of bounds.", "Beginner"),
      q("What happens if a throw-in passer steps onto the court while still holding the ball?",
        [["a","Nothing, as long as they step back before releasing"],["b","It is a throw-in violation"],["c","It results in a technical foul"],["d","The clock is reset"]],
        "b", "Stepping onto the court while holding the ball during a throw-in is a violation regardless of correcting afterward.", "Intermediate"),
      q("A pass deflects off one defender and then off a second defender before going out of bounds. Who gets the throw-in?",
        [["a","The defense, since two of their players touched it"],["b","The offense, since the defense was the last team to touch it"],["c","Whichever team is closer to the ball"],["d","It is replayed as a jump ball"]],
        "b", "The offense is awarded the throw-in because the defense caused the ball to go out.", "Intermediate"),
      q("What is the general time limit for releasing the ball on a throw-in?",
        [["a","There is no time limit"],["b","A short, specifically defined count (commonly five seconds)"],["c","Thirty seconds"],["d","One minute"]],
        "b", "Throw-ins are subject to a short defined count, commonly five seconds.", "Intermediate"),
      q("Can a throw-in passer move along the boundary line while holding the ball?",
        [["a","No, they must stay in one exact spot"],["b","Yes, within defined limits near the designated throw-in spot"],["c","Yes, anywhere along the entire boundary"],["d","Only if the defense agrees"]],
        "b", "Limited lateral movement is generally allowed near the designated spot.", "Advanced"),
      q("If officials disagree on which team caused the ball to go out of bounds, how is it typically resolved?",
        [["a","A coin flip"],["b","The crew conferences and the covering official's judgment, aided by any permitted review, determines the call"],["c","The home team's radio broadcast is consulted"],["d","It is always awarded to the offense"]],
        "b", "Crew communication and, where available, review tools resolve close out-of-bounds calls.", "Advanced"),
      q("A throw-in passer's team is warned for delay after multiple slow throw-ins across the game. What is the next step if it happens again?",
        [["a","Nothing further happens"],["b","A delay-of-game violation or technical foul may be assessed per the applicable procedure"],["c","The game is automatically forfeited"],["d","The passer is ejected"]],
        "b", "Repeated delay after a warning typically escalates to a violation or technical foul under standard procedure.", "Expert"),
      q("Case: A pass deflects off two different defenders before going out of bounds. Who is awarded the throw-in?",
        [["a","The offense, since the defense last touched it"],["b","The defense, since more than one of their players touched it"],["c","It is replayed as a jump ball"],["d","Whichever team requests it first"]],
        "a", "Regardless of how many defenders touched it, the defense being the last team to touch it awards the throw-in to the offense.", "Advanced", { isCasebook: true, citation: "Art. 6-3, Case 1" }),
      q("Case: A throw-in passer steps onto the court while holding the ball, then steps back out before releasing it. What is the ruling?",
        [["a","Legal, since they corrected themselves before releasing"],["b","A throw-in violation; the ball goes to the other team"],["c","A technical foul is assessed"],["d","The clock is stopped and restarted"]],
        "b", "Stepping onto the court while holding the ball is itself the violation, regardless of correcting before release.", "Expert", { isCasebook: true, citation: "Art. 6-5, Case 1" }),
    ],
  },
  {
    number: 7,
    title: "Basket Interference and Goaltending",
    body:
      "Basket interference and goaltending rules prevent players from illegally affecting a try for goal or the ball while it is above the level of the ring and has a chance of entering the basket. Goaltending applies to a try in flight on its downward path, or a try that has touched the backboard, when a defender touches the ball above the rim level. Basket interference includes touching the ball while it is within the imaginary cylinder above the rim, or touching the rim or net in a way that affects the ball's position while a try is in flight. Violations by the defense result in the basket counting as if made; violations by the offense cause the basket to be disallowed.",
    plays: [
      {
        citation: "Art. 7-2, Case 1",
        scenario:
          "A defender blocks a try for goal while the ball is still on its way up toward the basket, well below the level of the rim.",
        ruling:
          "This is a legal block, not goaltending, because the ball had not yet reached its highest point or begun a downward path above rim level.",
        diagram: diagram([
          ["O1", 50, 20, "O1", "Shooter — try is still rising, well below rim level"],
          ["D1", 50, 14, "D1", "Defender — legally blocks the shot below rim level"],
        ]),
      },
      {
        citation: "Art. 7-4, Case 1",
        scenario:
          "An offensive player grabs the rim and pulls it down while a teammate's try is still rolling around the basket.",
        ruling:
          "This is offensive basket interference; the basket is disallowed and the ball is awarded to the defense.",
        diagram: diagram([
          ["O1", 55, 6, "O1", "Offense — grabs and pulls down the rim"],
          ["O2", 45, 10, "O2", "Shooter — try is still rolling around the basket"],
          ["D1", 40, 14, "D1", "Defender — nearest to the play"],
        ]),
      },
    ],
    questions: [
      q("When does goaltending typically apply to a shot?",
        [["a","Any time a defender blocks a shot"],["b","When a defender touches the ball on its downward flight above rim level, or after it touches the backboard"],["c","Only on free throws"],["d","Only in the final minute of the game"]],
        "b", "Goaltending is specifically tied to downward-flight or backboard-contact timing above rim level.", "Beginner"),
      q("What is the penalty for defensive goaltending?",
        [["a","A technical foul"],["b","The basket counts as if made"],["c","The offense loses possession"],["d","Nothing; it is a legal play"]],
        "b", "Defensive goaltending results in the basket being awarded as made.", "Beginner"),
      q("A defender blocks a shot while it is still traveling upward, well below the rim. Is this legal?",
        [["a","No, all blocks near the basket are goaltending"],["b","Yes, this is a legal block"],["c","Only if the defender is taller than the shooter"],["d","Only on a missed free throw"]],
        "b", "Blocking a shot below rim level on its upward path is a legal block, not goaltending.", "Intermediate"),
      q("What is offensive basket interference?",
        [["a","An offensive player touching the ball or basket in a way that illegally affects a try while it has a chance to score"],["b","An offensive player setting a screen near the basket"],["c","An offensive player dunking the ball"],["d","An offensive player rebounding a missed shot"]],
        "a", "Offensive interference involves illegally affecting the ball or basket during a try, unlike ordinary legal offensive actions like dunking or rebounding.", "Intermediate"),
      q("What happens to a basket disallowed due to offensive basket interference?",
        [["a","It counts anyway"],["b","It is disallowed and the ball goes to the defense"],["c","It counts for one point only"],["d","The possession is replayed"]],
        "b", "Offensive interference results in a disallowed basket and defensive possession.", "Intermediate"),
      q("Does basket interference apply to touching the rim itself?",
        [["a","No, only the ball matters"],["b","Yes, touching the rim or net in a way that affects the ball's position can be interference"],["c","Only if the player hangs on the rim for more than three seconds"],["d","Only during free throws"]],
        "b", "Rim or net contact affecting the ball can also constitute interference, not just direct ball contact.", "Advanced"),
      q("A try for goal is touching the rim, rolling around, when a defender taps it out. Is this goaltending?",
        [["a","Yes, any contact once the ball touches the rim is goaltending"],["b","No, once the ball is on the rim, touching it is generally treated differently than touching it above the rim in flight"],["c","Yes, but only if the shot was a three-pointer"],["d","No, because rebounds are always legal"]],
        "b", "The rules distinguish contact with a ball above the rim in flight from contact with a ball already on the rim, which is generally not automatic goaltending.", "Advanced"),
      q("Which of the following best distinguishes a legal block from goaltending?",
        [["a","The height of the defender"],["b","Whether the ball was on a downward path above rim level, or had touched the backboard, at the moment of contact"],["c","Whether the shot was a jump shot or layup"],["d","Whether the shot clock had expired"]],
        "b", "The controlling factor is the ball's flight path and position relative to the rim, not player height or shot type.", "Expert"),
      q("Case: A defender blocks a try while it is still rising, well below the rim. What is the ruling?",
        [["a","Goaltending; the basket counts"],["b","A legal block; no violation"],["c","Basket interference; the ball goes to the offense"],["d","A foul on the defender"]],
        "b", "Blocking a shot on its upward path below rim level remains a legal block.", "Advanced", { isCasebook: true, citation: "Art. 7-2, Case 1" }),
      q("Case: An offensive player pulls down on the rim while a teammate's shot is still rolling around the basket. What is the ruling?",
        [["a","Legal, since it wasn't the shooter who touched the rim"],["b","Offensive basket interference; the basket is disallowed and the ball goes to the defense"],["c","A technical foul only"],["d","The basket counts because the ball was already on the rim"]],
        "b", "Illegally affecting the rim during a live try by an offensive player is offensive interference, disallowing the basket.", "Expert", { isCasebook: true, citation: "Art. 7-4, Case 1" }),
    ],
  },
  {
    number: 8,
    title: "Personal Fouls and Free Throws",
    body:
      "A personal foul involves illegal contact with an opponent that is not incidental to a legitimate attempt to play the ball. Common personal fouls include holding, pushing, illegal use of hands, and illegal screening. A player fouled while attempting a try for goal that is unsuccessful is awarded free throws corresponding to the value of the attempted shot; if the try is successful, the basket counts and one additional free throw is typically awarded. Team foul totals accumulate across a period and, once a threshold is reached, subsequent non-shooting fouls result in bonus free throws for the fouled team.",
    plays: [
      {
        citation: "Art. 8-3, Case 1",
        scenario:
          "A defender fouls a three-point shooter whose attempt is unsuccessful.",
        ruling:
          "The shooter is awarded three free throws, corresponding to the value of the attempted shot.",
        diagram: diagram([
          ["O1", 15, 50, "O1", "Shooter — releases a three-point try"],
          ["D1", 22, 48, "D1", "Defender — fouls the shooter during the release"],
        ]),
      },
      {
        citation: "Art. 8-6, Case 1",
        scenario:
          "A team commits its seventh team foul of the half on a non-shooting play after the bonus threshold has been reached.",
        ruling:
          "The fouled player is awarded bonus free throws under the applicable bonus procedure, in addition to the ball being restored to the offense as usual for other foul situations if the free throws are not made.",
      },
    ],
    questions: [
      q("What is a personal foul?",
        [["a","Any contact between two players"],["b","Illegal contact with an opponent not incidental to a legitimate play on the ball"],["c","Only contact that causes an injury"],["d","Any foul committed in the backcourt"]],
        "b", "Personal fouls are specifically illegal, non-incidental contact.", "Beginner"),
      q("How many free throws is a shooter awarded if fouled while missing a two-point attempt?",
        [["a","One"],["b","Two"],["c","Three"],["d","Zero"]],
        "b", "A missed two-point attempt with a shooting foul awards two free throws.", "Beginner"),
      q("What typically happens if a shooter is fouled but the basket is made?",
        [["a","No free throws are awarded"],["b","The basket counts and one additional free throw is awarded"],["c","The basket is disallowed"],["d","Three free throws are awarded regardless of shot value"]],
        "b", "A made basket plus a shooting foul results in the basket counting plus one bonus free throw.", "Intermediate"),
      q("What is a 'bonus' free throw situation?",
        [["a","Extra free throws awarded randomly"],["b","Free throws awarded for a non-shooting foul once a team's foul count reaches a defined threshold"],["c","Free throws awarded only in overtime"],["d","Free throws awarded for a technical foul"]],
        "b", "Bonus free throws are tied to accumulated team fouls reaching a threshold, for otherwise non-shooting fouls.", "Intermediate"),
      q("Which of the following is an example of illegal use of hands?",
        [["a","A defender with hands straight up while guarding"],["b","A defender grabbing and holding an opponent's arm to impede movement"],["c","A defender sliding their feet to stay in front of the dribbler"],["d","A defender taking a legal charge position"]],
        "b", "Grabbing and holding is illegal contact, unlike legal positioning or vertical defense.", "Intermediate", { isPointOfEmphasis: true }),
      q("A three-point shooter is fouled and misses the attempt. How many free throws are awarded?",
        [["a","Two"],["b","Three"],["c","One"],["d","None, since the shot missed"]],
        "b", "The free throw count matches the value of the attempted shot, so three free throws are awarded.", "Advanced"),
      q("Do team foul totals reset at the end of each period?",
        [["a","No, they carry over for the entire game"],["b","Yes, team foul counts typically reset at the start of each period for bonus purposes"],["c","Only in overtime"],["d","Only if a team requests it"]],
        "b", "Team foul counts for bonus purposes generally reset by period.", "Advanced"),
      q("Which best distinguishes incidental contact from a personal foul?",
        [["a","Incidental contact never happens in basketball"],["b","Incidental contact occurs during a legitimate attempt to play the ball and does not create an advantage, unlike a foul"],["c","Incidental contact is only relevant to free throws"],["d","There is no meaningful distinction"]],
        "b", "Officials distinguish fouls from incidental contact based on legitimacy of the attempt to play the ball and resulting advantage.", "Expert"),
      q("Case: A three-point shooter is fouled and the attempt is unsuccessful. How many free throws are awarded?",
        [["a","Two, matching a standard shooting foul"],["b","Three, matching the value of the attempted shot"],["c","One, since the shot missed"],["d","None, since three-point fouls are treated as non-shooting fouls"]],
        "b", "The award matches the attempted shot's value, so three free throws are correct.", "Advanced", { isCasebook: true, citation: "Art. 8-3, Case 1" }),
      q("Case: A team commits a non-shooting foul after already reaching the bonus threshold for the half. What is the ruling?",
        [["a","No free throws; the ball is simply given to the other team"],["b","The fouled player is awarded bonus free throws under the applicable procedure"],["c","A technical foul is automatically added"],["d","The offending player is disqualified"]],
        "b", "Reaching the bonus threshold means subsequent non-shooting fouls yield bonus free throws for the fouled team.", "Expert", { isCasebook: true, citation: "Art. 8-6, Case 1", isPointOfEmphasis: true }),
    ],
  },
  {
    number: 9,
    title: "Technical Fouls and Unsportsmanlike Conduct",
    body:
      "A technical foul may be assessed against a player, coach, or bench personnel for unsportsmanlike conduct such as taunting, excessive arguing with officials, or failing to comply with a warning. Unlike a personal foul, a technical foul does not require physical contact and can be assessed for conduct alone. Technical fouls typically result in free throws for the opposing team plus continued possession of the ball, and repeated technical fouls against the same individual can lead to ejection from the game. Officials are expected to use judgment and, where appropriate, a warning before assessing a technical foul for less severe conduct.",
    plays: [
      {
        citation: "Art. 9-2, Case 1",
        scenario:
          "A player slams the ball to the floor in frustration after a missed shot, with no contact toward any opponent or official.",
        ruling:
          "This may be assessed as a technical foul for unsportsmanlike conduct even though no contact occurred, at the official's judgment based on the severity of the act.",
      },
      {
        citation: "Art. 9-5, Case 1",
        scenario:
          "A head coach receives a second technical foul in the same game after an earlier warning.",
        ruling:
          "The coach is ejected from the game following the second technical foul, in addition to the free throws awarded to the opposing team.",
      },
    ],
    questions: [
      q("Does a technical foul require physical contact with an opponent?",
        [["a","Yes, always"],["b","No, it can be assessed for conduct alone"],["c","Only if the contact is intentional"],["d","Only during free throws"]],
        "b", "Technical fouls can be purely conduct-based, unlike personal fouls.", "Beginner"),
      q("What is a common consequence of a technical foul?",
        [["a","The offending team gains possession"],["b","Free throws for the opposing team plus continued possession"],["c","An automatic ejection every time"],["d","The game clock is reset to the start of the period"]],
        "b", "Technical fouls typically grant free throws and possession to the opponent.", "Beginner"),
      q("A player slams the ball down in frustration with no contact toward anyone. Can this be a technical foul?",
        [["a","No, since there was no contact"],["b","Yes, at the official's judgment based on severity"],["c","Only if it happens twice"],["d","Only if the coach requests it"]],
        "b", "Conduct alone, judged for severity, can warrant a technical foul.", "Intermediate"),
      q("What typically happens after a coach receives a second technical foul in the same game?",
        [["a","Nothing further beyond the free throws"],["b","The coach is ejected from the game"],["c","The team forfeits"],["d","The first technical foul is rescinded"]],
        "b", "A second technical foul against the same individual generally results in ejection.", "Intermediate"),
      q("Are officials expected to warn a player before assessing a technical foul for minor conduct?",
        [["a","Never; all conduct is treated identically"],["b","Where appropriate, yes, judgment and a warning may precede a technical for less severe conduct"],["c","Only if the head coach requests a warning"],["d","Only in the first half"]],
        "b", "Officials may use graduated judgment, including warnings, for less severe conduct.", "Intermediate"),
      q("Which of the following is most likely to be treated as unsportsmanlike conduct?",
        [["a","A player setting a legal screen"],["b","A player taunting an opponent after a dunk"],["c","A player calling for the ball on offense"],["d","A player boxing out for a rebound"]],
        "b", "Taunting is a classic example of unsportsmanlike conduct distinct from normal competitive play.", "Advanced", { isPointOfEmphasis: true }),
      q("Can bench personnel other than the head coach be assessed a technical foul?",
        [["a","No, only players and head coaches"],["b","Yes, bench personnel conduct can also result in a technical foul"],["c","Only if they enter the court"],["d","Only during timeouts"]],
        "b", "Technical foul liability can extend to other bench personnel, not just players and the head coach.", "Advanced"),
      q("How does a technical foul differ fundamentally from a personal foul in terms of what triggers it?",
        [["a","There is no difference"],["b","A personal foul requires illegal contact tied to playing the ball, while a technical foul addresses conduct and does not require contact"],["c","A technical foul can only be called on defense"],["d","A personal foul can only be called on offense"]],
        "b", "The core distinction is contact-based fouling versus conduct-based fouling.", "Expert"),
      q("Case: A player slams the ball to the floor in frustration with no contact toward anyone. Is a technical foul appropriate?",
        [["a","Never, without contact"],["b","Possibly, at the official's judgment based on the severity of the outburst"],["c","Only if it happens during a free throw"],["d","Only if the opposing coach objects"]],
        "b", "Judgment-based assessment applies to conduct like this, even without contact.", "Advanced", { isCasebook: true, citation: "Art. 9-2, Case 1", isPointOfEmphasis: true }),
      q("Case: A head coach receives a second technical foul after an earlier warning and technical in the same game. What is the ruling?",
        [["a","A third warning is given first"],["b","The coach is ejected in addition to the free throws awarded"],["c","Only the team is penalized, not the coach personally"],["d","The technical fouls cancel each other out"]],
        "b", "A second technical against the same individual results in ejection, on top of the free throw penalty.", "Expert", { isCasebook: true, citation: "Art. 9-5, Case 1" }),
    ],
  },
  {
    number: 10,
    title: "Violations: Traveling, Three-Second, Backcourt, and Shot Clock",
    body:
      "A traveling violation occurs when a player holding a live ball moves a pivot foot illegally or takes an excessive number of steps without dribbling. A three-second violation occurs when an offensive player remains within the free throw lane for longer than the allotted time while their team has control of the ball in the frontcourt. A backcourt violation occurs when the offensive team, after establishing control in the frontcourt, causes the ball to return to the backcourt illegally. A shot clock violation occurs when the offense fails to attempt a legal try for goal that has a chance to score before the shot clock expires. Each of these violations results in a turnover, awarding the ball to the opposing team for a throw-in.",
    plays: [
      {
        citation: "Art. 10-2, Case 1",
        scenario:
          "A player receives a pass while standing still, establishes a pivot foot, and then lifts that pivot foot before releasing a pass to a teammate.",
        ruling:
          "This is legal as long as the ball is released before the pivot foot returns to the floor; if the pivot foot touches down again before release, it is a traveling violation.",
        diagram: diagram([
          ["O1", 40, 55, "O1", "Passer — lifts the pivot foot, then releases before it returns to the floor"],
          ["O2", 70, 40, "O2", "Teammate — receives the pass"],
          ["D1", 45, 50, "D1", "Defender — guarding the passer"],
        ], [
          ["O1", "O2", "dashed"],
        ]),
      },
      {
        citation: "Art. 10-6, Case 1",
        scenario:
          "An offensive player is inadvertently knocked into the backcourt while trying to save a ball from going out of bounds, and then returns it to the frontcourt.",
        ruling:
          "This is not a backcourt violation because the player's presence in the backcourt was not a matter of team control being illegally returned; officiating judgment applies to the specific circumstances of incidental contact.",
        diagram: diagram([
          ["O1", 50, 92, "O1", "Offense — knocked into the backcourt while saving the ball"],
          ["O2", 50, 60, "O2", "Teammate — in the frontcourt, receives the ball back"],
          ["D1", 48, 88, "D1", "Defender — contact that sends O1 into the backcourt"],
        ], [
          ["O1", "O2", "solid"],
        ]),
      },
    ],
    questions: [
      q("What is a traveling violation?",
        [["a","Illegal movement of the pivot foot or excessive steps without dribbling"],["b","Holding the ball for too long"],["c","Passing the ball out of bounds"],["d","Dribbling with two hands"]],
        "a", "Traveling is specifically about illegal foot movement while holding a live ball.", "Beginner"),
      q("What is the general time limit for a three-second violation?",
        [["a","Ten seconds"],["b","Three seconds"],["c","Thirty seconds"],["d","One minute"]],
        "b", "The three-second rule limits time in the lane to three seconds, as the name suggests.", "Beginner"),
      q("What causes a backcourt violation?",
        [["a","Any pass that crosses half court"],["b","The offense illegally causing the ball to return to the backcourt after gaining frontcourt control"],["c","A defensive player crossing half court"],["d","A player dribbling too fast"]],
        "b", "Backcourt violations specifically involve the offense illegally sending the ball back after frontcourt control.", "Intermediate", { isPointOfEmphasis: true }),
      q("What happens if the offense fails to attempt a try before the shot clock expires?",
        [["a","Nothing; play continues"],["b","A shot clock violation is called, and the ball is turned over"],["c","The defense is charged a foul"],["d","The half ends immediately"]],
        "b", "A shot clock violation results in a turnover to the opposing team.", "Intermediate", { isPointOfEmphasis: true }),
      q("A player establishes a pivot foot and lifts it before passing. What must happen for this to remain legal?",
        [["a","The pivot foot may never lift at all"],["b","The ball must be released before the pivot foot returns to the floor"],["c","The player must dribble first"],["d","The player must call a timeout"]],
        "b", "Legal pivoting requires releasing the ball before the pivot foot touches back down.", "Advanced"),
      q("Is a player in the backcourt momentarily due to incidental contact automatically a backcourt violation?",
        [["a","Yes, any presence in the backcourt after frontcourt control is a violation"],["b","Not necessarily; officiating judgment considers whether the return to the backcourt was illegal team action"],["c","Only if the player dribbles while there"],["d","Only if the defense complains"]],
        "b", "Context matters; incidental, non-team-caused presence in the backcourt is treated differently.", "Advanced"),
      q("Can the three-second count reset before three full seconds have elapsed?",
        [["a","No, it always must reach three seconds"],["b","Yes, certain actions such as clearly starting a move to the basket may allow continued or reset counting per official judgment"],["c","Only if the player calls timeout"],["d","Only in the last two minutes of the game"]],
        "b", "Officials apply judgment to legitimate basket-ward moves near the end of a three-second count.", "Expert"),
      q("Which of the following best distinguishes a shot clock violation from a backcourt violation?",
        [["a","There is no meaningful difference"],["b","A shot clock violation concerns time-to-shoot, while a backcourt violation concerns illegally returning the ball across half court"],["c","A shot clock violation can only happen in the backcourt"],["d","A backcourt violation can only happen on defense"]],
        "b", "These are conceptually distinct violations tied to different rules and court zones.", "Expert"),
      q("Case: A player lifts their pivot foot to pass, and the ball is released before the pivot foot returns to the floor. Is this legal?",
        [["a","No, lifting the pivot foot at all is illegal"],["b","Yes, this is legal since the ball was released in time"],["c","Only legal if the player is stationary the entire time"],["d","Only legal on a shot, not a pass"]],
        "b", "Releasing the ball before the pivot foot returns to the floor keeps this legal.", "Advanced", { isCasebook: true, citation: "Art. 10-2, Case 1" }),
      q("Case: A player is knocked into the backcourt while saving a ball from going out of bounds and returns it to the frontcourt. Is this a backcourt violation?",
        [["a","Yes, any return from the backcourt after frontcourt control is a violation"],["b","Not necessarily; incidental, non-team-caused presence in the backcourt is judged differently"],["c","Yes, but only a warning is given the first time"],["d","No, because saves are always exempt from all violations"]],
        "b", "Officials weigh whether the backcourt presence resulted from illegal team action versus incidental circumstances.", "Expert", { isCasebook: true, citation: "Art. 10-6, Case 1" }),
    ],
  },
];

export const CURRENT_SEASON = "2025-26";

export const POINTS_OF_EMPHASIS = [
  {
    season: CURRENT_SEASON,
    title: "Verticality and Legal Guarding Position",
    body:
      "Officials are asked to more consistently reward defenders who establish legal guarding position and defend with verticality — hands straight up, no leaning or lateral movement into the offensive player. Grabbing, holding, and other illegal use of hands should be called promptly and consistently regardless of shot outcome.",
    linkedArticleIds: [`${SPORT_ID}:art8`],
  },
  {
    season: CURRENT_SEASON,
    title: "Unsportsmanlike Conduct Standards",
    body:
      "Crews should hold a consistent line on taunting, excessive complaining to officials, and other unsportsmanlike conduct — using a graduated warning where appropriate, but not hesitating to assess a technical foul for conduct that crosses the line, regardless of which team commits it.",
    linkedArticleIds: [`${SPORT_ID}:art9`],
  },
  {
    season: CURRENT_SEASON,
    title: "Backcourt and Shot-Clock Administration",
    body:
      "Emphasis this season is on precise administration of backcourt and shot-clock violations — correctly distinguishing incidental, non-team-caused backcourt presence from an illegal return of team control, and ensuring the shot clock is properly set and enforced after every change of team control.",
    linkedArticleIds: [`${SPORT_ID}:art10`],
  },
];

// ─── Mechanics (issue #20) ───────────────────────────────────────────────────
// Officiating mechanics — crew positioning, rotations, and coverage — is a
// distinct discipline from rules knowledge, so these questions are stored
// under one pseudo-article bucket (MECHANICS_ARTICLE_ID) rather than a real
// rule article; mastery is tracked against that bucket the same way article
// mastery is. Original practice content, not copied from any manual.

export const MECHANICS_ARTICLE_ID = `${SPORT_ID}:mechanics`;

function mq(stem, choices, correctId, explanation, difficulty) {
  return {
    stem,
    choices: choices.map(([id, text]) => ({ id, text })),
    correctId, explanation, difficulty,
    isCasebook: false, isPointOfEmphasis: false, citation: "Officiating Mechanics",
  };
}

export const MECHANICS_QUESTIONS = [
  // ── 2-person mechanics ──────────────────────────────────────────────────
  mq("In the 2-person mechanic, which official is generally responsible for the strong-side baseline drive to the basket?",
    [["a","Trail"],["b","Lead"],["c","Whichever official is closer to half court"],["d","Neither — it's a no-call zone"]],
    "b", "The Lead owns the baseline-to-lane area on the strong side and is best positioned to judge contact on drives to the rim.", "Beginner"),
  mq("What typically triggers a Lead/Trail rotation in the 2-person mechanic?",
    [["a","A made free throw"],["b","A ball reversal from one side of the court to the other"],["c","A timeout"],["d","A substitution"]],
    "b", "Ball reversal is the primary rotation trigger, allowing the Trail to become the new Lead and vice versa as the strong side changes.", "Beginner"),
  mq("On a fast break in the 2-person mechanic, what is the Trail official's primary responsibility?",
    [["a","Sprint wide and get to a position to see the entire transition play, including trailing defenders"],["b","Stay at half court no matter what"],["c","Run directly behind the ball handler"],["d","Immediately become the new Lead"]],
    "a", "The Trail sprints to open up an angle on the whole transition sequence rather than running in a straight line behind the play.", "Intermediate"),
  mq("Where should the Lead official generally be positioned during a change of possession that becomes a fast break the other way?",
    [["a","Standing still at the previous Lead spot"],["b","Working to get to a new Lead position at the opposite end before the play arrives"],["c","Following the ball handler up the sideline"],["d","Reporting to the table"]],
    "b", "The Lead hustles the length of the court to re-establish a baseline position ahead of the play.", "Intermediate"),
  mq("In the 2-person mechanic, who has primary coverage on a post player battling for position in the paint?",
    [["a","The Trail, from the top of the key"],["b","The Lead, from the baseline"],["c","Whichever official has a whistle ready"],["d","This is always a no-call situation"]],
    "b", "The Lead's baseline angle gives the best look at post positioning and contact.", "Beginner"),
  mq("During a throw-in from the frontcourt sideline in the 2-person mechanic, where should the non-administering official be?",
    [["a","Directly next to the throw-in spot"],["b","Opposite the throw-in, positioned to cover the far side of the play"],["c","At the scorer's table"],["d","Standing out of bounds"]],
    "b", "Splitting the coverage keeps one official on the throw-in administration and the other reading the developing play away from the ball.", "Intermediate"),
  mq("On free throws in the 2-person mechanic, where does the Trail official position?",
    [["a","Under the basket"],["b","At the free-throw line extended, opposite the table"],["c","At half court"],["d","Directly behind the shooter"]],
    "b", "The Trail takes the free-throw-line-extended slot to watch lane violations and rebounding position from the side.", "Beginner"),
  mq("Who has primary responsibility for a goaltending or basket interference judgment in the 2-person mechanic when the play develops near the Lead's basket?",
    [["a","The Trail, since they see the shot's arc"],["b","The Lead, from the strong-side baseline angle"],["c","Both officials must agree before any call"],["d","Neither official may rule on it without video review"]],
    "b", "The official with the better angle on the rim and backboard — typically the Lead near that basket — has primary responsibility.", "Advanced"),
  mq("What is the correct 2-person rotation when the ball is reversed from the Lead's strong side to the Trail's side?",
    [["a","Both officials stay in place"],["b","The Lead rotates to become the new Trail, and the Trail rotates to become the new Lead"],["c","The Lead calls a timeout to reset"],["d","Only the Trail moves; the Lead stays under the old basket"]],
    "b", "A full ball-side reversal triggers both officials to rotate so the new strong side is always covered by the new Lead.", "Advanced"),
  mq("In 2-person mechanics, which official typically administers a designated spot throw-in on the end line after a made basket?",
    [["a","Whichever official is already positioned to move quickly to that spot"],["b","Always the Lead, regardless of position"],["c","Always the Trail, regardless of position"],["d","The scorer's table administers all throw-ins"]],
    "a", "Administration of the throw-in follows the official who can get to the spot efficiently while the other official transitions downcourt.", "Intermediate"),
  mq("A defender is drawn away from the play while help-side rotation occurs. In 2-person mechanics, who is responsible for judging the help defender's positioning?",
    [["a","Only the Lead, always"],["b","Whichever official has that side of the court in their primary coverage area at that moment"],["c","No one — help defense is never officiated"],["d","The Trail only if the ball is above the free-throw line"]],
    "b", "Coverage responsibility follows court area, not a fixed official, so it depends on who has that side at the moment.", "Advanced"),
  mq("What should the 2-person crew do when both officials have a clear, differing view of a call on the same play?",
    [["a","The Referee's call always overrules the Umpire's, regardless of angle"],["b","The official with the primary coverage area for that play generally has the better angle and the crew defers accordingly, conferring only when appropriate"],["c","Whoever blows the whistle first wins"],["d","The play is automatically replayed"]],
    "b", "Primary coverage responsibility is designed to avoid overlapping judgment; conferences are reserved for specific situations like reviewing a shot clock or unsporting conduct."	, "Expert"),
  mq("On a last-second shot at the horn in the 2-person mechanic, who is primarily responsible for signaling whether the try was released in time?",
    [["a","The scorer's table alone"],["b","The official with the best angle on the shooter's release, typically the Lead or Trail depending on positioning"],["c","Whichever official is closest to the scorer's table"],["d","Instant replay is mandatory in all 2-person games"]],
    "b", "Timing judgment on a buzzer-beater falls to whichever official has the clearest angle on the release, consistent with normal coverage responsibility."	, "Expert"),
  mq("In the 2-person mechanic, which official generally has primary responsibility for a held ball / jump ball situation that occurs near midcourt?",
    [["a","Whichever official is nearer the play and has the best angle"],["b","Always the Trail"],["c","Always the Lead"],["d","Neither; a held ball is decided by the scorer's table"]],
    "a", "Proximity and angle — not a fixed role — determine who rules on a jump ball / held ball situation in the 2-person mechanic.", "Intermediate"),
  mq("When a defensive player commits a foul away from the primary coverage area of the nearest official, what should happen?",
    [["a","No foul can be called since it's outside the primary area"],["b","The official who saw the contact and has a legitimate angle may still call it"],["c","Only the Referee may call fouls away from the primary area"],["d","Play stops automatically for a booth review"]],
    "b", "Primary coverage areas guide positioning, but any official who clearly sees a foul may call it.", "Advanced"),
  mq("What is the main reason 2-person mechanics assign strong-side and weak-side responsibilities rather than each official simply watching the ball?",
    [["a","To reduce the number of fouls called overall"],["b","To ensure off-ball action, screens, and post play are consistently covered, not just ball-side action"],["c","Because watching the ball is against the rules"],["d","To split media broadcast duties"]],
    "b", "Assigned coverage areas ensure off-ball contact and positioning are officiated, not only the immediate ball action.", "Intermediate"),

  // ── 3-person mechanics ──────────────────────────────────────────────────
  mq("In the 3-person mechanic, what is the Center official's primary role?",
    [["a","Administering throw-ins from the scorer's table side"],["b","Covering the strong-side low post and off-ball action from the free-throw-line-extended slot opposite the Trail"],["c","Running the game clock"],["d","Always taking over as Lead on every possession"]],
    "b", "The Center works the free-throw-line-extended area opposite the Trail, with strong coverage of low-post and off-ball action.", "Beginner"),
  mq("In 3-person mechanics, which official is stationed under the basket on the endline?",
    [["a","The Lead"],["b","The Trail"],["c","The Center"],["d","No official is stationed there"]],
    "a", "The Lead holds the endline position under the basket, mirroring the 2-person Lead role.", "Beginner"),
  mq("On a ball reversal from one wing to the other in the 3-person mechanic, what rotation typically occurs?",
    [["a","No rotation is needed since there are three officials"],["b","The Center may become the new Trail, the Trail may become the new Center, while the Lead often stays or slides along the baseline"],["c","All three officials switch positions with each other in a fixed loop every possession"],["d","The Lead always becomes the Center"]],
    "b", "Reversal rotation in 3-person mechanics typically swaps Center and Trail responsibilities based on where the ball goes, while the Lead adjusts along the baseline.", "Advanced"),
  mq("In the 3-person mechanic, who generally has primary responsibility for strong-side rebounding coverage under the basket?",
    [["a","The Trail, from the top of the key"],["b","The Lead, from the baseline"],["c","The Center, from the free-throw-line-extended slot"],["d","Rebounding is never individually assigned"]],
    "b", "The Lead's baseline position gives the best angle on rebounding position and contact near the rim.", "Intermediate"),
  mq("What is the Trail's typical position in the 3-person mechanic when the ball is at the top of the key?",
    [["a","Under the basket"],["b","Above the top of the key, opposite the Center, with a wide-angle view of the whole half court"],["c","Directly guarding the point guard"],["d","At the scorer's table"]],
    "b", "The Trail sits back near the top of the key for a wide view, complementing the Lead and Center's closer-in coverage.", "Beginner"),
  mq("During a fast break, how does the 3-person crew typically get into transition position?",
    [["a","All three officials sprint in a single-file line behind the ball"],["b","One official sprints to the new Lead spot, one becomes the new Trail, and the third works to the Center slot as the play develops"],["c","The crew stays in their halfcourt positions regardless of the break"],["d","Only the Referee moves; the other two remain stationary"]],
    "b", "Transition mechanics in a 3-person crew distribute responsibility so the whole floor is covered quickly rather than everyone chasing the ball.", "Advanced"),
  mq("In 3-person mechanics, who is generally responsible for administering a throw-in on the Center's sideline?",
    [["a","Always the Lead"],["b","The Center, since they are positioned nearest that sideline"],["c","Always the Trail"],["d","The scorer's table administers all sideline throw-ins"]],
    "b", "Sideline throw-in administration typically follows whichever official is positioned closest to that spot — often the Center.", "Intermediate"),
  mq("What is a key advantage of the 3-person mechanic over the 2-person mechanic?",
    [["a","It requires less crew communication"],["b","It allows tighter coverage areas per official and a dedicated official for off-ball/post play"],["c","It eliminates the need for rotations entirely"],["d","Only one official needs rules knowledge"]],
    "b", "Adding a third official narrows each person's coverage area, especially strengthening off-ball and post coverage.", "Beginner"),
  mq("In the 3-person mechanic, who typically has primary responsibility for a screening foul that occurs away from the basket, near the top of the key?",
    [["a","The Lead, from the baseline"],["b","The Trail, given their position and angle at the top of the key"],["c","No one — screens away from the basket are not officiated"],["d","The Center, regardless of position"]],
    "b", "The Trail's positioning near the top of the key gives the best angle on screening action in that area.", "Intermediate"),
  mq("If the Center official is straight-lined (screened from seeing a play) by players between them and the action, what is the correct response?",
    [["a","Call whatever seems likely without a clear view"],["b","Trust that another official with a better angle has primary responsibility, and stay alert to help only if truly necessary"],["c","Stop the game immediately for a booth review"],["d","Blow the whistle automatically whenever vision is blocked"]],
    "b", "Straight-lining is expected occasionally; the crew's overlapping coverage areas mean another official likely has the better angle.", "Advanced"),
  mq("In the 3-person mechanic, which official generally reports a foul to the scorer's table?",
    [["a","Always the Referee, regardless of who called it"],["b","The official who called the foul"],["c","Whichever official is standing closest to the table at that moment"],["d","The Center only"]],
    "b", "The calling official reports the foul number and player to the table, maintaining accountability for the call.", "Beginner"),
  mq("During a dead ball for a held ball or void possession, how do 3-person crews typically decide who administers the alternating-possession throw-in?",
    [["a","Randomly, by coin flip"],["b","Whichever official is positioned nearest the resulting throw-in spot"],["c","Always the Center"],["d","The head coach chooses"]],
    "b", "Administration follows positioning, keeping the game moving efficiently.", "Intermediate"),
  mq("What is the correct 3-person rotation responsibility when the Lead needs to move from one baseline side to the other on a drive?",
    [["a","The Lead simply slides along the baseline to stay on the strong side of the ball"],["b","The Lead must always trade positions with the Center"],["c","The Lead leaves their position to the Trail"],["d","No movement is required; baseline coverage is fixed to one side all game"]],
    "a", "The Lead adjusts along the endline to remain on the strong side as the ball moves, without needing a full rotation with another official.", "Advanced"),
  mq("In 3-person mechanics, who is primarily responsible for administering substitutions at the table?",
    [["a","Whichever official is positioned nearest the table when the dead ball occurs, typically per pregame assignment"],["b","Always the Center, regardless of position"],["c","The head coach handles substitutions directly"],["d","Substitutions are never administered by officials"]],
    "a", "Pregame duty assignments typically designate table-side administration duties, generally falling to the official nearest the table.", "Intermediate"),
  mq("What is a primary reason 3-person crews conduct detailed pregame duty assignment meetings?",
    [["a","To decide who wears which color shirt"],["b","To clarify rotation responsibilities, coverage areas, and administrative duties before tip-off"],["c","Pregame meetings are optional and rarely held"],["d","To assign parking spots"]],
    "b", "Clear pregame assignments reduce confusion and gaps in coverage once the game starts.", "Beginner"),
  mq("In the 3-person mechanic, if the Trail is unable to see a potential backcourt violation because of a straight-line issue, who else might have a view?",
    [["a","No one; the play cannot be officiated"],["b","The Center or Lead, depending on who has an unobstructed angle on the division line at that moment"],["c","Only the Referee, if separately designated"],["d","The scorer's table rules on backcourt violations"]],
    "b", "Overlapping coverage areas mean another official may have a clean look at the division line even if the Trail's view is blocked.", "Advanced"),

  // ── Crew communication scenarios ────────────────────────────────────────
  mq("Your partner is clearly out of position for the developing play. What is the appropriate response?",
    [["a","Ignore it and hope they recover"],["b","Rotate or shift your own coverage to help cover the gap, using a pre-established communication signal if time allows"],["c","Stop the game immediately and announce the error"],["d","Wait until halftime to discuss it"]],
    "b", "Crews are trained to cover for each other in real time using subtle signals or positioning adjustments, not to publicly call out the issue.", "Intermediate"),
  mq("Two officials on the crew have different views on whether a shot was a two- or three-point attempt. What is the correct procedure?",
    [["a","The first official to signal wins automatically"],["b","The officials may confer, and the crew works together to determine the correct call, including table input if needed"],["c","The shot always counts as two points if there's any doubt"],["d","The head coach decides"]],
    "b", "Determining shot value is one of the situations where a brief conference between officials (and the table, if needed) is appropriate.", "Advanced"),
  mq("The game clock appears to malfunction and does not start on time after a made basket. What should an official do?",
    [["a","Ignore it; the table's clock is never an officiating concern"],["b","Use the recognized stop-the-clock or correction signal to alert the table and address the timing issue"],["c","Restart the entire quarter"],["d","Award a technical foul to the home team automatically"]],
    "b", "Officials use standard signals to communicate timing issues to the table so the clock can be corrected.", "Intermediate"),
  mq("A head coach is voicing strong disagreement with a call from the baseline. Who typically addresses the coach?",
    [["a","Whichever official is nearest the coach, using de-escalation techniques before involving the Referee if needed"],["b","Always the official who made the call, regardless of position"],["c","No official may speak to a coach during play"],["d","The scorer's table addresses all coach complaints"]],
    "a", "Proximity generally determines who first engages a coach, with more serious issues escalating to the Referee as needed.", "Intermediate"),
  mq("In a 2-person or 3-person crew, why are consistent hand signals for administrative stoppages (like a designated-spot throw-in) important?",
    [["a","They aren't important; verbal calls are always used instead"],["b","They let the crew and table communicate clearly without needing to shout across a loud gym"],["c","They are purely for the television broadcast"],["d","They replace the need for a scorer's table entirely"]],
    "b", "Standardized signals ensure clear communication in noisy environments where verbal calls may not carry.", "Beginner"),
  mq("After a held ball, the alternating-possession arrow is pointed the wrong direction by the table. What should the nearest official do?",
    [["a","Ignore it since the table controls the arrow"],["b","Alert the table to correct the arrow before the throw-in, since officials are responsible for accurate administration"],["c","Award a technical foul to the table"],["d","Restart the game from the opening tip"]],
    "b", "Officials are responsible for ensuring correct administration, including catching and correcting table errors like the possession arrow.", "Advanced"),
  mq("When reporting a foul to the table, what information does the calling official typically communicate?",
    [["a","Only the team's name"],["b","The offending player's number, the type of foul, and any free throws or resulting administration"],["c","Nothing — the table determines this independently"],["d","Only whether it was intentional"]],
    "b", "Clear, complete reporting ensures the table records the foul accurately and administers any resulting free throws or possession correctly.", "Beginner"),
  mq("A timeout is called by a team that has none remaining. How should the officiating crew communicate this to resolve it?",
    [["a","Grant the timeout anyway to avoid conflict"],["b","The official nearest the table confirms timeout counts with the table before granting or denying it, communicating the ruling clearly to both benches"],["c","Ignore the request entirely without a response"],["d","End the game immediately"]],
    "b", "Crews rely on clear communication with the table to verify timeout counts before making a ruling, then communicate that ruling to the teams.", "Advanced"),
  mq("Which crew communication tool is most associated with signaling that the clock should stop for an out-of-bounds violation?",
    [["a","A verbal shout only, with no hand signal"],["b","A raised closed fist or recognized stop-clock hand signal toward the table"],["c","Pointing at the scoreboard"],["d","Removing a whistle from the mouth"]],
    "b", "A recognized hand signal toward the table is the standard, visible way to communicate a clock stoppage.", "Beginner"),
  mq("Late in a close game, the crew wants to make sure everyone is aligned on end-of-game administration (e.g., final possession, clock management). When should this be discussed?",
    [["a","Only after the game, during the postgame review"],["b","Proactively, often during a timeout or dead-ball period as the situation approaches, not left to chance"],["c","It never needs discussion since the rules cover everything automatically"],["d","Only if a coach requests it"]],
    "b", "Experienced crews proactively communicate about upcoming end-of-game situations rather than waiting for something to go wrong.", "Expert"),
  mq("What is the purpose of a quick, discreet crew conference (not a full stoppage) between two officials during live administration?",
    [["a","To argue about who is right in front of the crowd"],["b","To quickly confirm or clarify a ruling using positioning and brief cues without disrupting game flow more than necessary"],["c","To decide which official gets credit for the call"],["d","It is never appropriate during live administration"]],
    "b", "Brief, discreet communication helps the crew get calls right while minimizing disruption to the game.", "Advanced"),

  // ── Additional 2-person, 3-person, and communication scenarios ─────────
  mq("In the 2-person mechanic, which official is generally responsible for administering a technical foul free throw and subsequent possession?",
    [["a","Always the official who did not call the technical foul"],["b","The calling official reports it, and the crew follows standard free-throw administration mechanics together"],["c","The scorer's table administers it without official involvement"],["d","Technical fouls do not result in free throws"]],
    "b", "The calling official reports the technical, and both officials then follow normal free-throw administration mechanics as a crew.", "Intermediate"),
  mq("In the 2-person mechanic, when the Trail is unable to advance downcourt quickly enough after a long outlet pass, what is the priority?",
    [["a","Abandon coverage and let the play go uncalled"],["b","Get to a position with the best available angle as quickly as possible, prioritizing safety and a legal angle over exact position"],["c","Stop the game until in position"],["d","Call a timeout"]],
    "b", "Officials are trained to prioritize getting to a legal, useful angle quickly rather than a perfect position at the cost of time.", "Advanced"),
  mq("Which best describes 'primary coverage area' in officiating mechanics?",
    [["a","A fixed spot on the floor an official must always stand on"],["b","A zone of the court an official is principally responsible for judging on a given play, which can shift with rotations"],["c","The area where only the Referee may make calls"],["d","A penalty box for officials"]],
    "b", "Primary coverage area is a responsibility zone tied to the current play and rotation, not a permanently fixed spot.", "Beginner"),
  mq("In 3-person mechanics, what generally happens to coverage responsibilities when the Center has to leave their spot to cover a fast break?",
    [["a","Nothing changes; the Center's zone goes uncovered"],["b","The Lead and Trail adjust to help cover the gap until the Center can re-establish position"],["c","The game is stopped until the Center returns"],["d","The Trail becomes the new Center permanently"]],
    "b", "Crews are trained to temporarily compensate for a teammate out of position during transition, restoring normal spacing once possible.", "Advanced"),
  mq("Why do 3-person crews rotate Center and Trail responsibilities on certain ball reversals rather than rotating all three officials?",
    [["a","To reduce the number of officials needed"],["b","Because the Lead's baseline responsibility generally stays tied to the strong side, while Center/Trail swap based on ball-side coverage"],["c","Rotation rules are identical to the 2-person mechanic"],["d","The Lead always becomes the Center on any reversal"]],
    "b", "The Lead typically slides along the baseline rather than swapping roles entirely, while Center and Trail more often exchange responsibilities.", "Expert"),
  mq("A player commits a foul in the backcourt while the primary-coverage official is looking elsewhere. What should happen?",
    [["a","No foul may ever be called if the primary official misses it"],["b","Another official with a clear, legitimate angle on the contact may make the call"],["c","The play must be reviewed by video before any call is made"],["d","Only the Referee can overrule a missed call"]],
    "b", "Overlapping coverage exists precisely so a missed angle by one official can be covered by another with a clean view.", "Advanced"),
  mq("What should a crew do during a pregame conference regarding held-ball and jump-ball procedures?",
    [["a","Skip this topic since it rarely happens"],["b","Confirm who administers throw-ins on the possession arrow and how rotations will be communicated"],["c","Decide which official will always win any disagreement"],["d","Assign a coin flip for every held ball during the game"]],
    "b", "Clarifying administrative responsibilities for held-ball situations before the game reduces confusion and delay.", "Intermediate"),
  mq("In the 2-person mechanic, what is a common reason a Trail official might arrive late to a new position after a change of possession?",
    [["a","Trail officials are not expected to move"],["b","The distance to sprint the length of the court combined with maintaining a legal, safe pace"],["c","Trail officials are required to walk, never jog"],["d","There is no such thing as arriving late in officiating"]],
    "b", "Covering full-court transition takes real hustle, and officials balance speed with maintaining control and a legal angle.", "Intermediate"),
  mq("Which crew communication practice helps prevent two officials from both swallowing their whistles on the same play, resulting in a missed call?",
    [["a","Never discussing coverage areas before the game"],["b","Clearly assigned primary coverage areas combined with a mindset of 'when in doubt, make the call if you have it'"],["c","Only the Referee is allowed to blow the whistle"],["d","Officials should always wait for a coach to point out a missed call"]],
    "b", "Clear primary responsibility, paired with a willingness to call plays within one's zone, reduces the chance a foul goes unaddressed.", "Advanced"),
  mq("In 3-person mechanics, what is the general guidance when the Lead, Center, and Trail all have a partial view of a hard screen away from the ball?",
    [["a","No one calls it since three partial views cancel out"],["b","The official with primary responsibility for that zone judges the contact; others defer unless clearly better positioned"],["c","All three must agree unanimously before any whistle"],["d","The play is automatically ruled incidental contact"]],
    "b", "Primary coverage assignment resolves ambiguity — the official responsible for that zone makes the call unless another has a distinctly superior angle.", "Expert"),
];

// ── Coverage-zone (tap-to-assign) scenarios ───────────────────────────────
// zones: [[id, x, y, width, height, correctOfficial], ...] — same 0-100
// court-percentage coordinate system as diagram(); correctOfficial matches
// one of the players' shortLabel values below.

function scenario(crewSize, title, description, players, zones) {
  return {
    crewSize, title, description,
    players: players.map(([id, x, y, shortLabel, role]) => ({ id, x, y, shortLabel, role })),
    zones: zones.map(([id, x, y, width, height, correctOfficial]) => ({ id, x, y, width, height, correctOfficial })),
  };
}

export const MECHANICS_SCENARIOS = [
  scenario(2, "2-Person: Strong-Side Set Play",
    "The ball is on the right wing. Assign primary coverage responsibility for each zone of the half court.",
    [
      ["L", 15, 8, "L", "Lead — baseline, strong side"],
      ["T", 70, 45, "T", "Trail — top of the key, opposite side"],
    ],
    [
      ["paint", 34, 3, 32, 22, "L"],
      ["strongCorner", 3, 3, 25, 25, "L"],
      ["weakCorner", 72, 3, 25, 25, "L"],
      ["topOfKey", 22, 28, 56, 20, "T"],
      ["backcourt", 3, 55, 94, 40, "T"],
    ]),
  scenario(2, "2-Person: Fast Break Transition",
    "Defense just secured a rebound and is pushing the ball up the floor. Assign coverage responsibility as the crew transitions.",
    [
      ["L", 50, 92, "L", "New Lead — sprinting to the far baseline"],
      ["T", 50, 50, "T", "Trail — trailing the play, wide angle"],
    ],
    [
      ["farPaint", 34, 3, 32, 22, "L"],
      ["farCorners", 3, 3, 94, 25, "L"],
      ["midcourt", 3, 40, 94, 25, "T"],
      ["backcourt", 3, 68, 94, 28, "T"],
    ]),
  scenario(3, "3-Person: Half-Court Set, Ball on Wing",
    "The ball is on the left wing with the Center on that side. Assign primary coverage responsibility for each zone.",
    [
      ["L", 15, 8, "L", "Lead — baseline"],
      ["C", 85, 30, "C", "Center — free-throw-line-extended, opposite the Trail"],
      ["T", 40, 55, "T", "Trail — top of the key, wide view"],
    ],
    [
      ["paint", 34, 3, 32, 22, "L"],
      ["strongCorner", 3, 3, 25, 25, "L"],
      ["weakWing", 72, 3, 25, 30, "C"],
      ["topOfKey", 22, 30, 45, 20, "T"],
      ["backcourt", 3, 60, 94, 35, "T"],
    ]),
  scenario(3, "3-Person: Post Play, Strong Side",
    "A post-up is developing on the right block. Assign primary coverage responsibility for each zone.",
    [
      ["L", 85, 8, "L", "Lead — baseline, strong side"],
      ["C", 15, 30, "C", "Center — opposite free-throw-line-extended"],
      ["T", 50, 55, "T", "Trail — top of the key"],
    ],
    [
      ["strongBlock", 50, 3, 30, 20, "L"],
      ["strongCorner", 72, 3, 25, 25, "L"],
      ["weakBlock", 20, 3, 30, 20, "C"],
      ["weakCorner", 3, 3, 25, 25, "C"],
      ["perimeter", 22, 30, 56, 22, "T"],
    ]),
  scenario(3, "3-Person: Ball Reversal Rotation",
    "The ball has just reversed from the right wing to the left wing. Assign each official's new primary coverage responsibility.",
    [
      ["L", 15, 8, "L", "Lead — slides along the baseline to the new strong side"],
      ["C", 85, 30, "C", "Center — becomes the new weak-side official"],
      ["T", 40, 55, "T", "Trail — becomes the new strong-side perimeter official"],
    ],
    [
      ["newStrongPaint", 34, 3, 32, 22, "L"],
      ["newStrongCorner", 3, 3, 25, 25, "L"],
      ["newWeakSide", 72, 3, 25, 30, "C"],
      ["newStrongPerimeter", 22, 30, 45, 20, "T"],
    ]),
];
