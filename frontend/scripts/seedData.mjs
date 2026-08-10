// Original practice content for NCAA Men's Basketball officiating study.
// Written from scratch for OfficialIQ — not copied from any NCAA publication.
// Replace with licensed rulebook/casebook text before a real launch (see issue #1).

export const SPORT_ID = "ncaa_basketball";
export const LEVEL_ID = "varsity";

function q(stem, choices, correctId, explanation, difficulty, opts = {}) {
  return {
    stem,
    choices: choices.map(([id, text]) => ({ id, text })),
    correctId,
    explanation,
    difficulty,
    isCasebook: !!opts.isCasebook,
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
      },
      {
        citation: "Art. 5-4, Case 1",
        scenario:
          "A player taps a loose ball into the basket after the officials' whistle has already sounded for an unrelated violation.",
        ruling:
          "The basket does not count because the ball was already dead at the moment of the whistle, regardless of what happens afterward.",
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
      },
      {
        citation: "Art. 6-5, Case 1",
        scenario:
          "A player taking a throw-in steps onto the playing court while still holding the ball, then steps back before releasing it.",
        ruling:
          "This is a throw-in violation; the ball is awarded to the opposing team for a throw-in at the same spot.",
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
      },
      {
        citation: "Art. 7-4, Case 1",
        scenario:
          "An offensive player grabs the rim and pulls it down while a teammate's try is still rolling around the basket.",
        ruling:
          "This is offensive basket interference; the basket is disallowed and the ball is awarded to the defense.",
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
        "b", "Grabbing and holding is illegal contact, unlike legal positioning or vertical defense.", "Intermediate"),
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
        "b", "Reaching the bonus threshold means subsequent non-shooting fouls yield bonus free throws for the fouled team.", "Expert", { isCasebook: true, citation: "Art. 8-6, Case 1" }),
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
        "b", "Taunting is a classic example of unsportsmanlike conduct distinct from normal competitive play.", "Advanced"),
      q("Can bench personnel other than the head coach be assessed a technical foul?",
        [["a","No, only players and head coaches"],["b","Yes, bench personnel conduct can also result in a technical foul"],["c","Only if they enter the court"],["d","Only during timeouts"]],
        "b", "Technical foul liability can extend to other bench personnel, not just players and the head coach.", "Advanced"),
      q("How does a technical foul differ fundamentally from a personal foul in terms of what triggers it?",
        [["a","There is no difference"],["b","A personal foul requires illegal contact tied to playing the ball, while a technical foul addresses conduct and does not require contact"],["c","A technical foul can only be called on defense"],["d","A personal foul can only be called on offense"]],
        "b", "The core distinction is contact-based fouling versus conduct-based fouling.", "Expert"),
      q("Case: A player slams the ball to the floor in frustration with no contact toward anyone. Is a technical foul appropriate?",
        [["a","Never, without contact"],["b","Possibly, at the official's judgment based on the severity of the outburst"],["c","Only if it happens during a free throw"],["d","Only if the opposing coach objects"]],
        "b", "Judgment-based assessment applies to conduct like this, even without contact.", "Advanced", { isCasebook: true, citation: "Art. 9-2, Case 1" }),
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
      },
      {
        citation: "Art. 10-6, Case 1",
        scenario:
          "An offensive player is inadvertently knocked into the backcourt while trying to save a ball from going out of bounds, and then returns it to the frontcourt.",
        ruling:
          "This is not a backcourt violation because the player's presence in the backcourt was not a matter of team control being illegally returned; officiating judgment applies to the specific circumstances of incidental contact.",
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
        "b", "Backcourt violations specifically involve the offense illegally sending the ball back after frontcourt control.", "Intermediate"),
      q("What happens if the offense fails to attempt a try before the shot clock expires?",
        [["a","Nothing; play continues"],["b","A shot clock violation is called, and the ball is turned over"],["c","The defense is charged a foul"],["d","The half ends immediately"]],
        "b", "A shot clock violation results in a turnover to the opposing team.", "Intermediate"),
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
