# ZBD QA Engineer Assessment – Quick Start Guide

## What's in This Repo

This complete submission contains:

### Part 1: Test Plan from PRD
- [test-plan.md](../TestPlanPRD/test-plan.md) - Main test plan deliverable
- [automation-strategy.md](./automation-strategy.md) - Automation roadmap

### Part 2: All Three Options (Combined)

**Everything is in `HandsOnExerciseABC/`**:
- **Option A**: Mock Payment API + 42 functional tests + load tests
- **Option B**: GitHub Actions CI/CD pipeline
- **Option C**: Terraform infrastructure (in `terraform/` subfolder)

All three options work together - the Terraform deploys the same API that's tested!

---

## Quick Start

### Clone the Repository

```bash
# Clone the repo
git clone https://github.com/YOUR-USERNAME/zbd-qa-assessment.git

# Navigate to directory
cd zbd-qa-assessment
```

---

## How to Review

### Quick Review

```bash
# Review Part 1 test plan
cat TestPlanPRD/test-plan.md

# Check load test report
cat docs/LOAD-TEST-REPORT.md

# Browse CI/CD workflow
cat HandsOnExerciseABC/.github/workflows/ci-cd.yml

# Review Terraform documentation
cat HandsOnExerciseABC/terraform/DOCUMENTATION.md
```

### Full Review

1. Read all markdown files in docs/ directory
2. Review TestPlanPRD/test-plan.md
3. Explore HandsOnExerciseABC directory
4. Review code files with comments
5. Run implementations locally (optional)

---

## How to Run the Code

### Run the API & Tests Locally

```bash
cd HandsOnExerciseABC

# Install dependencies
npm install

# Start the API
npm start

# In another terminal, run tests
npm test

# Run load tests (requires k6 or artillery)
npm run load-test
```

### Set Up CI/CD (GitHub)

```bash
# Push to GitHub
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/zbd-qa-assessment.git
git push -u origin main

# Then configure branch protection in GitHub:
# Settings -> Branches -> Add rule -> Require status checks
```

### Deploy to AWS (Terraform)

```bash
cd HandsOnExerciseABC/terraform

# Prerequisites: AWS account, AWS CLI configured, Terraform installed

# Copy and edit variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: set app_repo_url to your GitHub repo

# Set database password
export TF_VAR_db_password="$(openssl rand -base64 32)"

# Deploy
terraform init
terraform plan
terraform apply

# Run smoke tests
./smoke-test.sh

# Cleanup (destroys everything)
terraform destroy
```

---

## Directory Structure

```
zbd-qa-assessment/
├── TestPlanPRD/
│   └── test-plan.md              # Main test plan deliverable
│
├── docs/
│   ├── QUICK-START.md            # This file
│   ├── README.md                 # Overview
│   ├── README-API-TESTING.md     # Option A documentation
│   ├── README-CICD-PIPELINE.md   # Option B documentation
│   ├── LOAD-TEST-REPORT.md       # Load test findings
│   └── automation-strategy.md    # Automation roadmap
│
└── HandsOnExerciseABC/           # ALL THREE OPTIONS
    ├── .github/workflows/
    │   └── ci-cd.yml             # Option B: CI/CD pipeline
    │
    ├── terraform/                # Option C: Infrastructure
    │   ├── main.tf               # AWS resources
    │   ├── variables.tf
    │   ├── outputs.tf
    │   ├── user_data.sh          # Deploys this API!
    │   ├── smoke-test.sh
    │   ├── DOCUMENTATION.md      # IaC guide
    │   └── README.md
    │
    ├── payment-api.js            # Option A: Mock API
    ├── functional-tests.test.js  # 42 tests
    ├── load-test.js
    ├── load-test-artillery.yml
    └── package.json
```

---

## Key Files to Review

### Must Read
1. [TestPlanPRD/test-plan.md](../TestPlanPRD/test-plan.md) - Main test plan deliverable
2. [docs/LOAD-TEST-REPORT.md](./LOAD-TEST-REPORT.md) - Test findings
3. [HandsOnExerciseABC/terraform/DOCUMENTATION.md](../HandsOnExerciseABC/terraform/DOCUMENTATION.md) - IaC best practices

### Deep Dive
1. [docs/automation-strategy.md](./automation-strategy.md) - Automation approach
2. [HandsOnExerciseABC/functional-tests.test.js](../HandsOnExerciseABC/functional-tests.test.js) - Test examples
3. [HandsOnExerciseABC/.github/workflows/ci-cd.yml](../HandsOnExerciseABC/.github/workflows/ci-cd.yml) - Pipeline config
4. [HandsOnExerciseABC/terraform/main.tf](../HandsOnExerciseABC/terraform/main.tf) - Infrastructure code

---

## What Makes This Stand Out

- **Comprehensive**: All requirements + bonus content
- **Integrated**: All options work together as one system
- **Production-Ready**: Not demos, but usable code
- **Well-Documented**: Every decision explained
- **Best Practices**: Security, cost, scalability

---

## Upload to GitHub

```bash
# Create new repo (via GitHub UI or CLI)
git init
git add .
git commit -m "Senior QA Engineer Technical Assessment - Complete Submission"
git branch -M main
git remote add origin https://github.com/your-username/zbd-qa-assessment.git
git push -u origin main
```

---

**Ready to review!**

For detailed information on each component, see the README files in the docs/ and HandsOnExerciseABC/ directories.
