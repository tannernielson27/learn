/**
 * The question bank behind the real-size corpus documents (#594). Every word is fictional and
 * written for LeaRN's tests: no real patients, and nothing copied from any test bank.
 *
 * A real test bank is one topic after another with the same few stems, so that is how this one is
 * built: each topic gives a finding to report, a first action and a teaching statement, and the
 * wrong options come from short lists that are wrong for every topic (a normal finding is never
 * the one to report; restocking supplies is never the first action). That keeps one defensible
 * answer for each question without 480 options typed by hand.
 */

export interface Topic {
  /** The condition, as it reads after "a client who has". */
  has: string;
  /** More about the client, as it reads after the condition. Only the long stems use it. */
  context: string;
  /** The finding the nurse reports. */
  report: string;
  /** For a select-all question: two more findings to report. */
  alsoReport?: readonly [string, string];
  /** What has just happened, as it reads after "a client who has". */
  event: string;
  /** The action the nurse takes first when it does. */
  first: string;
  /** What a client who understood the teaching says. */
  teach: string;
}

export const TOPICS: readonly Topic[] = [
  {
    has: "heart failure",
    context: "and is receiving furosemide 40 mg IV twice daily",
    report: "Weight gain of 2 kg (4.4 lb) since yesterday morning",
    alsoReport: [
      "Crackles in both lung bases",
      "Swelling of both ankles that is worse than yesterday",
    ],
    event: "crackles in both lung bases and new shortness of breath while lying flat",
    first: "Raise the head of the bed to a high Fowler's position",
    teach: "I will weigh myself every morning before breakfast.",
  },
  {
    has: "type 1 diabetes mellitus",
    context: "and takes insulin glargine every evening",
    report: "Blood glucose of 52 mg/dL before breakfast",
    event: "a blood glucose of 48 mg/dL and is awake, shaky and sweating",
    first: "Give 15 g of a fast-acting carbohydrate by mouth",
    teach: "I will check my blood glucose before each meal and at bedtime.",
  },
  {
    has: "chronic obstructive pulmonary disease",
    context: "and uses oxygen at 2 L/min by nasal cannula",
    report: "Oxygen saturation of 84% while resting in bed",
    alsoReport: ["Bluish color of the lips", "New confusion and restlessness"],
    event: "an oxygen saturation of 85% and is breathing fast while slumped in bed",
    first: "Help the client sit upright and lean forward on the overbed table",
    teach: "I will breathe out slowly through pursed lips when I feel short of breath.",
  },
  {
    has: "a new tracheostomy",
    context: "that was placed 2 days ago",
    report: "Steady bright red bleeding from around the tracheostomy tube",
    event: "gurgling breath sounds and visible secretions in the tracheostomy tube",
    first: "Suction the tracheostomy tube",
    teach: "I will keep a spare tracheostomy tube of the same size at my bedside.",
  },
  {
    has: "a chest tube",
    context: "connected to a water-seal drainage system after a lobectomy",
    report: "Drainage of 250 mL of bright red blood in the last hour",
    event: "a disconnected chest tube after turning in bed",
    first: "Place the end of the chest tube in a container of sterile water",
    teach: "I will keep the drainage container below the level of my chest.",
  },
  {
    has: "a hip fracture",
    context: "and had surgical repair this morning",
    report: "Foot on the affected side that is cool, pale and numb",
    event: "sudden chest pain and shortness of breath 2 days after hip surgery",
    first: "Apply oxygen and raise the head of the bed",
    teach: "I will not cross my legs or bend my hip past 90 degrees.",
  },
  {
    has: "an acute ischemic stroke",
    context: "and received alteplase 2 hours ago",
    report: "New severe headache with vomiting",
    event: "new facial drooping and slurred speech that started 20 minutes ago",
    first: "Call the rapid response team and note the time the symptoms started",
    teach: "I will call emergency services right away if my face droops or my speech slurs.",
  },
  {
    has: "a seizure disorder",
    context: "and takes phenytoin 100 mg three times daily",
    report: "Seizure activity that lasts longer than 5 minutes",
    event: "a generalized tonic-clonic seizure while lying in bed",
    first: "Turn the client onto one side",
    teach: "I will take my seizure medicine at the same times every day, even when I feel well.",
  },
  {
    has: "acute pancreatitis",
    context: "and has had nothing by mouth for 24 hours",
    report: "Muscle twitching and tingling around the mouth",
    event: "severe abdominal pain rated 9 on a scale of 0 to 10 from acute pancreatitis",
    first: "Give the prescribed IV hydromorphone",
    teach: "I will avoid alcohol completely after I go home.",
  },
  {
    has: "cirrhosis of the liver",
    context: "and ascites",
    report: "New confusion and a flapping tremor of the hands",
    event: "vomiting of bright red blood and a history of esophageal varices",
    first: "Turn the client onto one side and keep the airway clear",
    teach: "I will not take acetaminophen or other medicines without asking my provider first.",
  },
  {
    has: "chronic kidney disease",
    context: "and receives hemodialysis three times a week",
    report: "Potassium level of 6.4 mEq/L",
    alsoReport: [
      "Weight gain of 3 kg since the last dialysis session",
      "New irregular heart rhythm",
    ],
    event: "a potassium level of 6.8 mEq/L and tall, peaked T waves on the cardiac monitor",
    first: "Notify the provider and prepare to give the prescribed IV calcium gluconate",
    teach: "I will limit foods that are high in potassium, such as bananas and oranges.",
  },
  {
    has: "an arteriovenous fistula",
    context: "in the left forearm for hemodialysis",
    report: "No thrill felt and no bruit heard over the fistula",
    event: "a blood pressure of 82/48 mm Hg and dizziness 1 hour after hemodialysis",
    first: "Lower the head of the bed and raise the client's legs",
    teach:
      "I will not let anyone take a blood pressure or draw blood from the arm with my fistula.",
  },
  {
    has: "a urinary tract infection",
    context: "and an indwelling urinary catheter",
    report: "Temperature of 39.2 °C (102.6 °F) with shaking chills",
    event: "a temperature of 39.4 °C (102.9 °F), a heart rate of 124/min and new confusion",
    first: "Notify the provider and obtain the prescribed blood cultures",
    teach: "I will finish all of the antibiotic, even after the burning stops.",
  },
  {
    has: "pneumonia",
    context: "and is receiving IV antibiotics",
    report: "Respiratory rate of 32/min with use of the neck muscles to breathe",
    alsoReport: ["Oxygen saturation of 86% on 2 L/min of oxygen", "Bluish color of the nail beds"],
    event: "thick secretions, a weak cough and an oxygen saturation of 88%",
    first: "Raise the head of the bed and help the client cough and deep breathe",
    teach: "I will use my incentive spirometer 10 times every hour while I am awake.",
  },
  {
    has: "a pulmonary embolism",
    context: "and is receiving a continuous heparin infusion",
    report: "Blood in the urine and bleeding from the gums",
    event:
      "an activated partial thromboplastin time (aPTT) of 140 seconds during a heparin infusion",
    first: "Stop the heparin infusion and notify the provider",
    teach: "I will use a soft toothbrush and an electric razor while I take a blood thinner.",
  },
  {
    has: "atrial fibrillation",
    context: "and takes warfarin 5 mg every evening",
    report: "International normalized ratio (INR) of 5.2",
    event: "an irregular heart rate of 152/min and reports feeling lightheaded",
    first: "Check the blood pressure and attach the cardiac monitor",
    teach: "I will keep the amount of green leafy vegetables I eat about the same each week.",
  },
  {
    has: "stable angina",
    context: "and a prescription for sublingual nitroglycerin",
    report: "Chest pain that is not relieved by rest and three doses of nitroglycerin",
    event: "crushing chest pain that spreads to the left arm and jaw",
    first: "Stop the client's activity and obtain a 12-lead ECG",
    teach:
      "I will sit down and put one nitroglycerin tablet under my tongue when chest pain starts.",
  },
  {
    has: "hypertension",
    context: "and takes lisinopril 20 mg daily",
    report: "Swelling of the lips and tongue",
    event: "swelling of the tongue and a hoarse voice 1 hour after a first dose of lisinopril",
    first: "Assess the airway and call the rapid response team",
    teach: "I will get up slowly when I go from lying down to standing.",
  },
  {
    has: "a deep vein thrombosis",
    context: "in the left calf",
    report: "Sudden shortness of breath and chest pain on breathing in",
    event: "a swollen, warm and painful left calf after a long flight",
    first: "Tell the client not to rub the leg and notify the provider",
    teach: "I will not massage my calf, and I will report any new chest pain right away.",
  },
  {
    has: "peptic ulcer disease",
    context: "and takes ibuprofen for arthritis pain",
    report: "Black, tarry stools",
    event: "a rigid, board-like abdomen and sudden severe pain in the upper abdomen",
    first: "Keep the client on nothing by mouth and notify the provider",
    teach: "I will avoid aspirin and ibuprofen unless my provider says they are safe.",
  },
  {
    has: "a small bowel obstruction",
    context: "and a nasogastric tube set to low intermittent suction",
    report: "Abdomen that is rigid and more distended than 4 hours ago",
    event: "a nasogastric tube that has stopped draining and a distended abdomen with new nausea",
    first: "Check the placement and patency of the nasogastric tube",
    teach: "I will call my provider if I vomit or cannot pass gas.",
  },
  {
    has: "a new colostomy",
    context: "that was created 1 day ago",
    report: "Stoma that is dark purple and dry",
    event: "a colostomy pouch that is leaking stool onto the surrounding skin",
    first: "Remove the pouch and clean the skin around the stoma",
    teach: "I will empty the pouch when it is one-third to one-half full.",
  },
  {
    has: "hypothyroidism",
    context: "and takes levothyroxine 75 mcg daily",
    report: "Heart rate of 46/min with a temperature of 35.2 °C (95.4 °F)",
    event:
      "a heart rate of 132/min, tremors and palpitations after taking extra doses of levothyroxine",
    first: "Withhold the next dose of levothyroxine and notify the provider",
    teach: "I will take my levothyroxine on an empty stomach at the same time every morning.",
  },
  {
    has: "Addison's disease",
    context: "and takes hydrocortisone twice daily",
    report: "Blood pressure of 84/50 mm Hg with new weakness and vomiting",
    event:
      "severe weakness, vomiting and a blood pressure of 78/44 mm Hg after missing doses of hydrocortisone",
    first: "Notify the provider and prepare to give the prescribed IV hydrocortisone",
    teach: "I will wear a medical alert bracelet and never stop my steroid suddenly.",
  },
  {
    has: "sickle cell disease",
    context: "and was admitted with a vaso-occlusive crisis",
    report: "Sudden chest pain with a new cough and fever",
    event: "severe joint pain rated 10 on a scale of 0 to 10 during a sickle cell crisis",
    first: "Give the prescribed IV morphine",
    teach: "I will drink plenty of fluids and avoid getting too cold.",
  },
  {
    has: "iron deficiency anemia",
    context: "and takes ferrous sulfate tablets",
    report: "Shortness of breath and a heart rate of 128/min while resting",
    event: "itching, flushing and back pain 10 minutes after a blood transfusion was started",
    first: "Stop the transfusion",
    teach: "I will take my iron tablets with a glass of orange juice.",
  },
  {
    has: "neutropenia",
    context: "after a second cycle of chemotherapy",
    report: "Temperature of 38.3 °C (100.9 °F)",
    event: "a new fever and chills 8 days after chemotherapy",
    first: "Obtain the prescribed blood cultures and start the antibiotic within 1 hour",
    teach: "I will stay away from crowds and from people who are sick.",
  },
  {
    has: "a pressure injury",
    context: "over the sacrum",
    report: "Foul-smelling green drainage from the wound",
    event: "a surgical wound that has opened with a loop of bowel showing",
    first: "Cover the wound with sterile gauze moistened with sterile saline",
    teach: "I will change my position at least every 2 hours while I am in bed.",
  },
  {
    has: "a long leg cast",
    context: "applied 6 hours ago for a tibia fracture",
    report: "Pain that gets worse when the toes are moved and is not relieved by opioids",
    event: "a cast on the forearm with fingers that are cold, pale and numb",
    first: "Notify the provider at once and keep the arm at the level of the heart",
    teach: "I will not push anything inside the cast to scratch my skin.",
  },
  {
    has: "myasthenia gravis",
    context: "and takes pyridostigmine four times daily",
    report: "Difficulty swallowing and a weak cough",
    event: "increasing muscle weakness and shallow breathing at a rate of 30/min",
    first: "Assess the client's airway and breathing effort",
    teach: "I will take my pyridostigmine on time, about 30 minutes before meals.",
  },
  {
    has: "Parkinson's disease",
    context: "and takes carbidopa-levodopa",
    report: "Choking and coughing with every meal",
    event: "a piece of food blocking the airway and cannot speak or cough",
    first: "Give abdominal thrusts",
    teach: "I will take my carbidopa-levodopa at the same times every day.",
  },
  {
    has: "a spinal cord injury at T4",
    context: "from 3 months ago",
    report: "Pounding headache with a blood pressure of 210/118 mm Hg",
    event:
      "a pounding headache, a flushed face and a blood pressure of 220/120 mm Hg after a spinal cord injury",
    first: "Raise the head of the bed to a sitting position",
    teach: "I will check my skin for redness every day with a mirror.",
  },
  {
    has: "a concussion",
    context: "after a fall from a ladder",
    report: "Repeated vomiting and increasing drowsiness",
    event: "clear fluid draining from the nose after a head injury",
    first: "Collect the drainage on sterile gauze and notify the provider",
    teach: "I will come back to the hospital if I vomit more than once or become very sleepy.",
  },
  {
    has: "major depressive disorder",
    context: "and started sertraline 1 week ago",
    report: "Statement that the client has a plan to end their life",
    event: "a plan to take an overdose of pills tonight",
    first: "Stay with the client and remove items that could cause harm",
    teach: "I know it can take several weeks before my antidepressant works fully.",
  },
  {
    has: "alcohol use disorder",
    context: "and had a last drink 36 hours ago",
    report: "Tremors, sweating and seeing things that are not there",
    event:
      "severe tremors, agitation and a heart rate of 128/min 2 days after a last drink of alcohol",
    first: "Give the prescribed benzodiazepine",
    teach: "I will go to a support group meeting and keep my follow-up appointments.",
  },
  {
    has: "preeclampsia",
    context: "at 34 weeks of gestation and is receiving magnesium sulfate",
    report: "Respiratory rate of 10/min with absent deep tendon reflexes",
    alsoReport: ["Urine output of 20 mL/h", "Severe headache with blurred vision"],
    event: "a respiratory rate of 8/min and absent reflexes during a magnesium sulfate infusion",
    first: "Stop the magnesium sulfate infusion",
    teach: "I will report a severe headache, blurred vision or pain under my ribs right away.",
  },
  {
    has: "gestational diabetes",
    context: "at 30 weeks of gestation",
    report: "Fasting blood glucose of 142 mg/dL on 3 mornings in a row",
    event: "a soft, boggy uterus and heavy bleeding 1 hour after a vaginal birth",
    first: "Massage the uterine fundus until it is firm",
    teach: "I will check my blood glucose when I wake up and after each meal.",
  },
  {
    has: "asthma",
    context: "and uses a fluticasone inhaler twice daily",
    report: "A silent chest with very little air movement",
    event: "loud wheezing and an oxygen saturation of 89% during an asthma attack",
    first: "Give the prescribed albuterol by nebulizer",
    teach: "I will rinse my mouth after I use my steroid inhaler.",
  },
  {
    has: "dehydration",
    context: "after 3 days of vomiting and diarrhea",
    report: "Urine output of 15 mL/h for the last 2 hours",
    alsoReport: ["Heart rate of 126/min while resting", "Blood pressure of 86/52 mm Hg"],
    event: "a sodium level of 118 mEq/L and new confusion",
    first: "Start seizure precautions and notify the provider",
    teach: "I will sip an oral rehydration solution often, even if I am not thirsty.",
  },
  {
    has: "a peripherally inserted central catheter",
    context: "for long-term IV antibiotics",
    report: "Redness, swelling and pain along the arm above the insertion site",
    event: "an IV site that is swollen, cool and pale during a potassium chloride infusion",
    first: "Stop the infusion",
    teach: "I will keep the dressing dry and call if the site becomes red or swollen.",
  },
];

/** Findings that are normal for any client: never the one to report. */
const NORMAL_FINDINGS = [
  "Blood pressure of 118/76 mm Hg while sitting in a chair",
  "Heart rate of 76/min with a regular rhythm",
  "Oxygen saturation of 97% while breathing room air",
  "Temperature of 37.0 °C (98.6 °F) by mouth",
  "Respiratory rate of 16/min with even, quiet breaths",
  "Urine output of 60 mL/h of clear yellow urine",
  "Capillary refill of 2 seconds in the fingers and toes",
  "Pain rated 2 on a scale of 0 to 10 after repositioning",
  "Alert and oriented to person, place and time",
  "Bowel sounds heard in all four quadrants",
  "Skin that is warm, dry and pink",
  "Clear breath sounds in both lungs",
] as const;

/** Things a nurse does at some point in a shift, and never first when a client is in trouble. */
const LATER_ACTIONS = [
  "Document the finding in the client's record",
  "Offer the client a warm blanket and dim the lights",
  "Review the discharge instructions with the client",
  "Ask the client about food preferences for the next meal",
  "Schedule a follow-up appointment for next week",
  "Teach the client about a heart-healthy diet",
  "Reassess the client in 4 hours",
  "Update the plan of care at the end of the shift",
  "Ask a family member to bring the client's glasses from home",
  "Give the client a pamphlet about support groups",
  "Restock the supplies in the client's room",
  "Weigh the client before breakfast tomorrow",
] as const;

/** Statements that show the teaching did not work, whatever it was about. */
const WRONG_STATEMENTS = [
  "I will stop taking my medicine as soon as I feel better.",
  "I will take a double dose if I miss one.",
  "I will skip my follow-up visits if I feel well.",
  "I will wait a week before I report new symptoms.",
  "I will share my medicine with a family member who has the same problem.",
  "I do not need to keep a list of the medicines I take.",
  "I will take my medicine only on the days I have symptoms.",
  "I can change my dose by myself when my symptoms change.",
  "I will start herbal supplements without telling my provider.",
  "I will throw away my written instructions when I get home.",
  "I do not need to tell my other providers about this diagnosis.",
  "I will use a family member's leftover prescription if I run out.",
] as const;

/** One question as a document prints it: the stem, the options in order, and which are right. */
export interface BankQuestion {
  stem: string;
  options: string[];
  /** The places of the right options, from 0, in order. One for a multiple choice question. */
  correct: number[];
  /** A select-all question (multiple response); otherwise multiple choice. */
  selectAll: boolean;
}

/** Three entries of a list of twelve, different for each question and never the same twice. */
const three = (pool: readonly string[], seed: number): string[] =>
  [0, 4, 8].map((step) => pool[(seed * 5 + step) % pool.length]);

/**
 * Where the right option goes among four, for question `index` of family `family`. A fixed
 * scramble: the same on every run, and no pattern down the page that a reader, or a model,
 * could use in place of the answer.
 */
const placeFor = (index: number, family: number): number =>
  (Math.imul(index * 3 + family + 1, 2654435761) >>> 28) % 4;

/** `right` put among `wrong` at `place`, so the key is not always the same letter. */
function single(stem: string, right: string, wrong: string[], place: number): BankQuestion {
  const at = place % (wrong.length + 1);
  const options = [...wrong.slice(0, at), right, ...wrong.slice(at)];
  return { stem, options, correct: [at], selectAll: false };
}

const quoted = (statement: string) => `"${statement}"`;

/** "Which finding should the nurse report?", with the client's treatment in the stem or not. */
export function reportQuestion(topic: Topic, index: number, long: boolean): BankQuestion {
  const who = long ? `${topic.has} ${topic.context}` : topic.has;
  return single(
    `A nurse is caring for a client who has ${who}. Which finding should the nurse report to the provider?`,
    topic.report,
    three(NORMAL_FINDINGS, index),
    placeFor(index, 0),
  );
}

/** The select-all form of the same question: three findings to report among five. */
export function reportAllQuestion(topic: Topic, index: number): BankQuestion {
  if (!topic.alsoReport) throw new Error(`${topic.has} has no second finding to report`);
  const [normalOne, normalTwo] = three(NORMAL_FINDINGS, index + 7);
  // The two normal findings sit at different places from one question to the next.
  const layouts = [
    [topic.report, normalOne, topic.alsoReport[0], topic.alsoReport[1], normalTwo],
    [normalOne, topic.report, topic.alsoReport[0], normalTwo, topic.alsoReport[1]],
    [topic.alsoReport[0], topic.report, normalOne, normalTwo, topic.alsoReport[1]],
  ];
  const options = layouts[index % layouts.length];
  const right = new Set([topic.report, ...topic.alsoReport]);
  return {
    stem: `A nurse is caring for a client who has ${topic.has} ${topic.context}. Which findings should the nurse report to the provider? Select all that apply.`,
    options,
    correct: options.flatMap((option, at) => (right.has(option) ? [at] : [])),
    selectAll: true,
  };
}

/** "Which action should the nurse take first?" */
export function firstActionQuestion(topic: Topic, index: number): BankQuestion {
  return single(
    `A nurse is caring for a client who has ${topic.event}. Which action should the nurse take first?`,
    topic.first,
    three(LATER_ACTIONS, index + 3),
    placeFor(index, 1),
  );
}

/** "Which statement shows that the teaching was effective?" */
export function teachingQuestion(topic: Topic, index: number): BankQuestion {
  return single(
    `A nurse is teaching a client who has ${topic.has} about care at home. Which statement by the client shows that the teaching was effective?`,
    quoted(topic.teach),
    three(WRONG_STATEMENTS, index + 5).map(quoted),
    placeFor(index, 2),
  );
}

/** The letter printed before an option: A for the first. */
export const letter = (place: number): string => String.fromCharCode(65 + place);

/** A question's key as a document prints it: "B", or "A, C, D". */
export const keyLetters = (question: BankQuestion): string =>
  question.correct.map(letter).join(", ");
