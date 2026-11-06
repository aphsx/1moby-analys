# Moby Analytics

Internal analytics for 1Moby's B2B messaging business (SMS / Email / OTP on prepaid credit): predicts
which customers will churn, what they are worth, and when they will run out of credit.

## People

**Customer**:
A 1Moby business account that buys prepaid messaging credit. The thing being predicted about.
_Avoid_: client, account, user

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

## Customer classifications

**Lifecycle Stage**:
A rule-based (never predicted) label from a Customer's activity before the Cutoff Date: Active Paid,
Active Free, Churned (had activity, none in the last 180 days), or Ghost (no activity ever).
_Avoid_: status, state

**Churn Risk Level**:
The low / medium / high / critical bucket of a Customer's predicted probability of churning within the
Horizon.
_Avoid_: risk score, churn score

**CLV**:
The amount a Customer is predicted to pay over the next 6 months.
_Avoid_: LTV, lifetime value, revenue forecast

**Value Tier**:
The high / mid / low / none bucket of a Customer's CLV.
_Avoid_: value segment, tier

**Credit Urgency**:
How soon a Customer is predicted to run out of prepaid credit: stable, monitor, warning, or critical.
_Avoid_: top-up risk, credit risk

**Segment**:
The action group a Customer falls into by combining Value Tier and Churn Risk Level (e.g. High-Value At-Risk).
_Avoid_: cluster, cohort, group
