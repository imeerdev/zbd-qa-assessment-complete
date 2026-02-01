# Supporting Documentation

> **Note:** The Terraform infrastructure (Option C) is provided as an example configuration and is not deployed, as it incurs AWS costs (~$40/month). The CI/CD pipeline and tests run for free on GitHub Actions.

## Part 1: Test Plan from PRD

**PRD:** Rewards SDK – Achievement-Based Bitcoin Payouts

The main test plan deliverable is located at:
- [Test Plan](./docs/TestPlanPRD/test-plan.md) – Scope, scenarios, risks, and strategy

The `docs/` folder contains supporting documentation for the hands-on implementation.

---

## Part 2: Hands-On Implementation

This section contains a **complete solution** combining API testing, CI/CD pipeline, and infrastructure as code – all working together in one GitHub repository.

### Option A: API Testing with Load Component
- **Mock Payment API** (`payment-api.js`) - Express.js server simulating ZBD-style Bitcoin rewards
- **Functional Tests** (`functional-tests.test.js`) - 14 test suites (42 tests) using Jest & Supertest
- **Load Tests** (`load-test.js`, `load-test-artillery.yml`) - k6 and Artillery configurations
- **Test Report** (`LOAD-TEST-REPORT.md`) - Detailed findings and recommendations

**Full documentation**: [README-API-TESTING.md](./docs/README-API-TESTING.md)

### Option B: CI/CD Pipeline Setup
- **GitHub Actions Workflow** (`.github/workflows/ci-cd.yml`) - Comprehensive 8-job pipeline
- **Multi-stage quality gates** that block bad merges
- **Matrix testing** across Node.js 16, 18, 20
- **Coverage enforcement** (80% minimum threshold)

**Full documentation**: [README-CICD-PIPELINE.md](./docs/README-CICD-PIPELINE.md)

### Option C: Infrastructure as Code (Terraform)
- **AWS Infrastructure** (`terraform/`) - EC2, RDS, VPC, S3
- **Automated Deployment** - Deploys this exact API to AWS
- **Smoke Tests** - Validates deployment works correctly
- **Cost**: ~$40/month for test environment

**Quick start**: [terraform/README.md](./HandsOnExerciseABC/terraform/README.md)
**Deep dive**: [terraform/DOCUMENTATION.md](./HandsOnExerciseABC/terraform/DOCUMENTATION.md) (multi-env, secrets, security)

---

## Part 3: Problem Solving

### Scenario 1: Lightning Payment Timeout Bug

A critical production bug where Lightning payments timeout but users are still charged (1% normal, 5% during spikes).

- [LIGHTNING-TIMEOUT-BUG-ANALYSIS.md](./docs/ProbSolving/LIGHTNING-TIMEOUT-BUG-ANALYSIS.md) - Root cause, testing gaps, and prevention strategy
- [CHAOS-TESTING-LIGHTNING-TIMEOUT.md](./docs/CHAOS-TESTING-LIGHTNING-TIMEOUT.md) - Full technical guide with reproduction steps, k6 tests, and code fixes

### Scenario 2: First QA Engineer at ZBD

Starting as the first QA engineer at a Bitcoin/Lightning payment platform with mobile apps and APIs.

- [FIRST-QA-ENGINEER-30-DAY-PLAN.md](./docs/ProbSolving/FIRST-QA-ENGINEER-30-DAY-PLAN.md) - 30-day plan, speed vs coverage, testing real money

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the API

```bash
npm start
# API runs on http://localhost:3000
```

### 3. Run Tests

```bash
# In another terminal
npm test

# With coverage
npm run test:coverage
```

### 4. Run Load Tests

```bash
# Using k6
npm run load-test:k6

# Using Artillery
npm run load-test
```

### 5. Set Up CI/CD (GitHub)

1. Push this code to a GitHub repository
2. Configure branch protection (Settings -> Branches -> Add rule)
3. Select required status checks: `code-quality`, `test`, `build`
4. Pipeline runs automatically on push/PR

### 6. Deploy to AWS (Terraform)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your GitHub repo URL
export TF_VAR_db_password="$(openssl rand -base64 32)"
terraform init && terraform apply
```

## Repository Structure

```
zbd-qa-assessment-complete/
├── README.md                              # This file
│
├── .github/
│   └── workflows/
│       └── ci-cd.yml                      # Option B: CI/CD pipeline
│
├── docs/
│   ├── TestPlanPRD/
│   │   └── test-plan.md                   # Part 1: Test plan deliverable
│   │
│   ├── README-API-TESTING.md              # Option A documentation
│   ├── README-CICD-PIPELINE.md            # Option B documentation
│   ├── LOAD-TEST-REPORT.md                # Load test findings
│   ├── CHAOS-TESTING-LIGHTNING-TIMEOUT.md # Chaos testing guide
│   ├── QUICK-START.md                     # Quick start guide
│   ├── automation-strategy.md             # Automation approach
│   │
│   ├── ProbSolving/                       # Part 3: Problem solving
│   │   ├── LIGHTNING-TIMEOUT-BUG-ANALYSIS.md
│   │   └── FIRST-QA-ENGINEER-30-DAY-PLAN.md
│   │
│   └── images/
│       └── testing-pyramid.png
│
└── HandsOnExerciseABC/                    # Part 2: Hands-on implementation
    ├── terraform/                         # Option C: Infrastructure
    │   ├── main.tf                        # AWS resources
    │   ├── variables.tf
    │   ├── outputs.tf
    │   ├── user_data.sh
    │   ├── smoke-test.sh
    │   ├── DOCUMENTATION.md
    │   └── README.md
    │
    ├── payment-api.js                     # Option A: Mock API
    ├── functional-tests.test.js           # 42 Jest tests
    ├── load-test.js                       # k6 load test
    ├── load-test-artillery.yml            # Artillery load test
    ├── artillery-functions.js
    └── package.json
```

## Key Results

### API Testing (Option A)
- **42 functional tests** in 14 test suites
- **95% code coverage** (exceeds 80% threshold)
- **Load tested** with 50-100 concurrent users
- **Zero duplicate payouts** in 9,200 requests

### CI/CD Pipeline (Option B)
- **8 pipeline jobs**: code quality, tests (matrix), build, security, performance, deploy, notify
- **Fast failure**: Blocks bad code in <30 seconds
- **Matrix testing**: Node.js 16, 18, 20
- **Artifact management**: Coverage reports, build packages

### Infrastructure (Option C)
- **Production-ready Terraform** with ~400 lines of heavily-commented code
- **Deploys the actual API** from this repository
- **Includes**: EC2, RDS PostgreSQL, VPC, S3, Security Groups
- **Cost**: ~$40/month for test environment

## How It All Works Together

```
┌─────────────────────────────────────────────────────────────────┐
│                     THIS REPOSITORY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DEVELOP LOCALLY                                              │
│     npm install && npm start                                     │
│     npm test                                                     │
│                                                                  │
│  2. PUSH TO GITHUB                                               │
│     git push origin main                                         │
│          │                                                       │
│          ▼                                                       │
│  3. CI/CD PIPELINE RUNS AUTOMATICALLY                            │
│     ├── Code quality checks                                      │
│     ├── Tests on Node 16, 18, 20                                │
│     ├── Coverage enforcement (80%)                               │
│     └── Build artifacts                                          │
│          │                                                       │
│          ▼                                                       │
│  4. DEPLOY TO AWS (terraform apply)                              │
│     ├── Clones this repo                                         │
│     ├── Installs dependencies                                    │
│     ├── Starts payment-api.js                                    │
│     └── Runs smoke tests                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why Combined?

All three options use the **same API**. Combining them:
- Eliminates duplicate code
- Shows how API testing integrates with CI/CD and infrastructure
- Demonstrates a complete workflow from development to production
- Single repository = single source of truth

---

**See [README-API-TESTING.md](./docs/README-API-TESTING.md) for API testing details**
**See [README-CICD-PIPELINE.md](./docs/README-CICD-PIPELINE.md) for CI/CD pipeline details**
**See [terraform/README.md](./HandsOnExerciseABC/terraform/README.md) for infrastructure quick start**
