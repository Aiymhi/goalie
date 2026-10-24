# Content Review Record

All content in `content/tracks.json` is original prose expressing general, widely-accepted facts. No copyrighted text is copied from any source; only the *category* of widely-accepted source basis is cited below. Every numeric worked example and every mastery `correctIndex` was hand-checked for a single defensible correct answer before `reviewed: yes` was recorded.

This file is the semantic review record (the human gate). The validator in `scripts/validate-catalog.mjs` is the structural gate; it confirms shape and id uniqueness but cannot judge correctness, which is what this record attests to.

## Scope

- 3 tracks x 3 levels = 9 levels.
- 2 lessons per level = 18 lessons.
- 1 mastery check (5 single-correct questions) per level = 9 mastery checks, 45 questions.

Id conventions (binding): lessons `<trackId>-<levelId>-<n>`, mastery questions `<trackId>-<levelId>-m<n>`, using the literal track id (`computer-science`, `economics`, `personal-finance`) and literal level id (`beginner`, `intermediate`, `advanced`).

## Lessons

| Item id | Source basis (category) | Reviewed |
| --- | --- | --- |
| computer-science-beginner-1 | Standard introductory computer-science curriculum | yes |
| computer-science-beginner-2 | Standard introductory computer-science curriculum | yes |
| computer-science-intermediate-1 | Standard introductory algorithms / complexity curriculum | yes |
| computer-science-intermediate-2 | Standard introductory algorithms / complexity curriculum | yes |
| computer-science-advanced-1 | General systems-design education | yes |
| computer-science-advanced-2 | General systems-design education | yes |
| economics-beginner-1 | Standard introductory microeconomics curriculum | yes |
| economics-beginner-2 | Standard introductory microeconomics curriculum | yes |
| economics-intermediate-1 | Standard introductory microeconomics curriculum | yes |
| economics-intermediate-2 | Standard introductory microeconomics curriculum | yes |
| economics-advanced-1 | Standard public / welfare economics curriculum | yes |
| economics-advanced-2 | Standard public / welfare economics curriculum | yes |
| personal-finance-beginner-1 | General personal-finance education | yes |
| personal-finance-beginner-2 | General personal-finance education | yes |
| personal-finance-intermediate-1 | General personal-finance education | yes |
| personal-finance-intermediate-2 | General personal-finance education | yes |
| personal-finance-advanced-1 | General personal-finance education | yes |
| personal-finance-advanced-2 | General personal-finance education | yes |

## Mastery checks

Each mastery check below is one 5-question, single-correct multiple-choice set. Every `correctIndex` was hand-checked for exactly one defensible correct answer, with no two options simultaneously correct and no ambiguous stems.

| Item id (mastery check for level) | Source basis (category) | Reviewed |
| --- | --- | --- |
| computer-science-beginner mastery (m1-m5) | Standard introductory computer-science curriculum | yes |
| computer-science-intermediate mastery (m1-m5) | Standard introductory algorithms / complexity curriculum | yes |
| computer-science-advanced mastery (m1-m5) | General systems-design education | yes |
| economics-beginner mastery (m1-m5) | Standard introductory microeconomics curriculum | yes |
| economics-intermediate mastery (m1-m5) | Standard introductory microeconomics curriculum | yes |
| economics-advanced mastery (m1-m5) | Standard public / welfare economics curriculum | yes |
| personal-finance-beginner mastery (m1-m5) | General personal-finance education | yes |
| personal-finance-intermediate mastery (m1-m5) | General personal-finance education | yes |
| personal-finance-advanced mastery (m1-m5) | General personal-finance education | yes |

### Individual mastery question ids (all hand-checked, reviewed: yes)

- computer-science-beginner-m1, -m2, -m3, -m4, -m5
- computer-science-intermediate-m1, -m2, -m3, -m4, -m5
- computer-science-advanced-m1, -m2, -m3, -m4, -m5
- economics-beginner-m1, -m2, -m3, -m4, -m5
- economics-intermediate-m1, -m2, -m3, -m4, -m5
- economics-advanced-m1, -m2, -m3, -m4, -m5
- personal-finance-beginner-m1, -m2, -m3, -m4, -m5
- personal-finance-intermediate-m1, -m2, -m3, -m4, -m5
- personal-finance-advanced-m1, -m2, -m3, -m4, -m5

## Numeric spot-checks recorded

- computer-science-intermediate: worst-case scan of n items = n comparisons; 50 to 200 is a 4x scale, 50 -> 200. Correct.
- computer-science-advanced: 100 ms/request one-at-a-time => 1000/100 = 10 req/s; 50 ms => 20 req/s; 20 ms => 50 req/s. Correct.
- economics: opportunity cost = single best forgone alternative (studying over film). Correct.
- economics-intermediate: elastic/inelastic classification from percent response (10% price vs 1-2% quantity = inelastic; vs 30% = elastic). Correct.
- personal-finance-beginner: 2,000 - 1,800 = 200; 1,500 - 1,350 = 150. Correct.
- personal-finance-intermediate: simple interest 1,000 x 0.05 = 50/yr; 2,000 x 0.05 = 100. Compound year 2: 1,050 x 0.05 = 52.50. Correct.
- personal-finance-advanced: 1,000 x 0.10 = 100/yr simple; two years = 200. Correct.

Finance disclaimer: the `personal-finance` track carries a top-level `disclaimer` field stating the content is educational only and not personalized advice; the validator requires it on that track specifically.
