# Moby Analytics

Internal analytics for 1Moby's B2B messaging business (SMS / Email / OTP on prepaid credit): predicts
which customers will churn, what they are worth, and when they will run out of credit.

## People

**Customer**:
A 1Moby business account that buys prepaid messaging credit. The thing being predicted about.
_Avoid_: client, account, user

**Payer**:
A Customer who paid more than ฿0 within a given period (a month or a year), whatever their Lifecycle
Stage. A ฿0 credit grant is not a payment.
_Avoid_: paying customer, buyer

**User**:
A 1Moby staff member signed in to the platform. Every User can do everything; there are no roles.
_Avoid_: admin, member, viewer, analyst

## Data

**Data Source**:
One uploaded Excel workbook in the fixed 8-sheet 1Moby format. Always either a Train Data Source or a
Predict Data Source; both follow the same workbook format.
_Avoid_: dataset, catalog, file, upload

**Train Data Source**:
A Data Source used to fit models. Its history must extend past the Cutoff Date so outcomes can be observed.

**Predict Data Source**:
A Data Source whose Customers are scored by a Prediction Run.

**Import**:
Copying a workbook's sheets into the system as-is, before any typing or fixing.
_Avoid_: upload, ingest, load

**Clean**:
Turning imported rows into typed Customers, payments and usage, ready for modelling.
_Avoid_: normalize, transform, process

## Time

**Cutoff Date**:
The simulated "today" of a run: everything before it is known, everything after it is the future being
predicted. Always the first day of a month.
_Avoid_: as-of date, snapshot date, reference date

**Horizon**:
How far past the Cutoff Date an outcome is measured: 180 days for churn and CLV, 30 and 90 days for credit.
_Avoid_: window, lookahead

## Models and runs

**Model Type**:
One of the three predicted things: churn, CLV, or credit forecast.

**Training Run**:
One attempt to fit candidate models of every Model Type from a Train Data Source at a Cutoff Date.
_Avoid_: job, training job

**Model Version**:
One fitted, saved model of a Model Type, produced by a Training Run.
_Avoid_: model, artifact, checkpoint

**Champion**:
The one Model Version of a Model Type that Prediction Runs use.
_Avoid_: production model, active model, pinned model, live model

**Promotion**:
Making a Model Version the Champion, either automatically after a Training Run beats the current
Champion, or by a User choosing it.
_Avoid_: activate, pin, deploy

**Prediction Run**:
Scoring every Customer of a Predict Data Source with the current Champions at a Cutoff Date.
_Avoid_: job, batch, scoring run

**Prediction Output**:
The per-Customer result of a Prediction Run.
_Avoid_: result, score, prediction row

**Realized Outcome**:
What actually happened to a Prediction Run's Customers once its Horizon has passed, set against what
was predicted.
_Avoid_: actuals, ground truth, backfill

**Backtest**:
Measuring at an earlier cutoff in the same data, where what happened next is already known. Training
backtests each candidate model at older cutoffs; the overview backtests a behaviour (how Sending Months
relate to churn) six months before the Cutoff Date. Unlike a Realized Outcome, it never waits for new data.
_Avoid_: holdout, lookback

## Customer classifications

**Lifecycle Stage**:
A rule-based (never predicted) label from a Customer's activity before the Cutoff Date: Active Paid,
Active Free, Churned (had activity, none in the last 180 days), or Ghost (no activity ever). "Active"
always means one of these stages, never a count of Customers who sent messages in a month.
_Avoid_: status, state

**Churn Risk Level**:
The low / medium / high / critical bucket of a Customer's predicted probability of churning within the
Horizon.
_Avoid_: risk score, churn score

**CLV**:
The amount a Customer is predicted to pay over the next 6 months.
_Avoid_: LTV, lifetime value, revenue forecast

**Value Tier**:
The high / mid / low / none bucket of a Customer's CLV, ranked against the other Active Customers of the
same Prediction Run whose CLV is above ฿0: high is the top 10%, mid the next 40%, low the bottom half.
None means there is nothing to rank: the Customer is predicted to pay ฿0, or is not Active.
_Avoid_: value segment, tier

**Credit Urgency**:
How soon a Customer is predicted to top up (buy credit) next: critical within 14 days, warning within 30,
monitor within 90, stable after that. It is a predicted payment date, not the day their credit runs out.
_Avoid_: top-up risk, credit risk, run-out date

**Segment**:
A grouping each Prediction Run gives a Customer from their Lifecycle Stage, value (the high and mid Value
Tiers count as one), health (Churn Risk Level, or the predicted chance they are still active) and usage
growth. It describes a Customer; it is not what to do about them, which is the Playbook.
_Avoid_: cluster, cohort, group, action group

**Sending Months**:
How many of the months in the 180 days before a date a Customer sent messages in (at most 5 for a
month-start date). Not "active months": "Active" means a Lifecycle Stage.
_Avoid_: active months, usage months

## Acting on predictions

**Revenue at Risk**:
A Customer's churn probability times their CLV: how much of their next 6 months of payments is expected
to be lost to churn. Only Active Paid Customers with a churn score have one.
_Avoid_: expected loss, value at risk, money at risk

**Call List**:
Active Paid Customers with a churn score, ordered by Revenue at Risk, largest first: who to contact first.
It is not limited to any Value Tier or Churn Risk Level.
_Avoid_: top priority, priority list, call-first group

**Playbook**:
The fixed action for each pair of Value Tier and Churn Risk Level (e.g. high value with critical risk: an
Account Manager calls this week). Every Customer in the same pair gets the same action.
_Avoid_: segment, recommendation, next best action, guidance
