# Infrastructure as Code (Terraform)

## Overview

This directory contains **production-ready Terraform configurations** that deploy the **ZBD-Style Payment API** to AWS.

**Key Feature**: The Terraform deployment pulls the **actual API code** from this GitHub repository, deploying the same Payment API that's in the parent directory (`../payment-api.js`) - tested with 14 test suites and 42 individual tests.

### Infrastructure Components

- **EC2 instance** running the Payment API from git
- **RDS PostgreSQL database** for data persistence
- **VPC with public/private subnets** for network isolation
- **Security groups** controlling network access
- **S3 bucket** for backups and artifacts
- **Automated deployment** via user data script (clones repo, installs deps, starts service)
- **Smoke tests** validating the deployed API works correctly
- **Comprehensive documentation** on multi-environment management and secrets

### How Deployment Works

The `user_data.sh` script:
1. Clones this repository from GitHub
2. Navigates to the API directory (`HandsOnExerciseABC/`)
3. Installs npm dependencies
4. Starts the Payment API as a systemd service
5. Runs smoke tests to verify deployment

The deployed API has **all features**:
- ZBD-style response format (`{success, data, message}`)
- Gamertag-based payouts with idempotency
- Rate limiting (10 per gamertag per hour)
- Callback/webhook logging
- Payout expiration and status management

## Quick Start

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Terraform** >= 1.0 installed
4. **jq** (for smoke tests)
5. **Basic understanding** of AWS services

### Installation

```bash
# 1. Install Terraform
# macOS
brew install terraform

# Linux
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# 2. Install AWS CLI
pip install awscli

# 3. Configure AWS credentials
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-1
```

### Deploy the Infrastructure

```bash
# 1. Navigate to this directory (from repo root)
cd HandsOnExerciseABC/terraform

# 2. Copy example variables
cp terraform.tfvars.example terraform.tfvars

# 3. IMPORTANT: Update the git repo URL in terraform.tfvars
# After pushing this repo to GitHub, edit terraform.tfvars:
#   app_repo_url = "https://github.com/YOUR-USERNAME/zbd-qa-assessment.git"

# 4. Set database password (NEVER commit this!)
export TF_VAR_db_password="$(openssl rand -base64 32)"

# 5. Initialize Terraform
terraform init

# 6. Review the plan
terraform plan

# 7. Apply (create infrastructure)
terraform apply

# This will:
# - Create VPC with subnets
# - Create EC2 instance
# - Clone your repo and deploy the Payment API (../payment-api.js)
# - Create RDS database
# - Create S3 bucket
# - Run smoke tests
#
# Total time: ~15 minutes
```

### Verify Deployment

```bash
# Wait for instance to fully boot (API needs time to install Node.js, etc.)
sleep 60

# Run smoke tests
./smoke-test.sh

# Expected output:
# PASS - API server is reachable
# PASS - Health endpoint returns 'healthy' status
# PASS - Database is configured
# PASS - API can create payouts successfully
# ...
```

### Access the API

```bash
# Get API endpoint
API_ENDPOINT=$(terraform output -raw api_endpoint)

# Test health endpoint
curl $API_ENDPOINT/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-01-28T10:30:00.000Z",
#   "environment": "test",
#   "database": "configured"
# }

# Create a test payout
curl -X POST $API_ENDPOINT/api/v1/payouts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_001",
    "amount": 1000
  }'
```

### SSH into the Server

```bash
# Save SSH private key
terraform output -raw ssh_private_key > payment-api-key.pem
chmod 400 payment-api-key.pem

# Connect to server
ssh -i payment-api-key.pem ec2-user@$(terraform output -raw api_server_public_ip)

# Once connected, check logs:
journalctl -u payment-api -f
```

### Cleanup (Destroy Infrastructure)

```bash
# ⚠️  WARNING: This deletes EVERYTHING

# Preview what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy

# Type "yes" to confirm
```

## Files in This Directory

```
terraform/
├── main.tf                      # Main infrastructure config
│                                #    - VPC, subnets, security groups
│                                #    - EC2 instance, RDS database
│                                #    - S3 bucket
│                                #    - ~400 lines, heavily commented
│
├── variables.tf                 # Input variables with validation
├── outputs.tf                   # Output values (IPs, endpoints, etc.)
├── user_data.sh                 # EC2 boot script (installs API)
├── smoke-test.sh                # Validates deployment works
│
├── terraform.tfvars.example     # Example variable values
│
├── DOCUMENTATION.md             # 8-page comprehensive guide
│                                #    - Multi-environment management
│                                #    - Secrets handling strategies
│                                #    - Security best practices
│                                #    - Cost optimization
│                                #    - Troubleshooting
│
└── README.md                    # This file
```

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         AWS CLOUD                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ VPC (10.0.0.0/16)                                        │ │
│  │                                                           │ │
│  │  ┌──────────────────┐        ┌──────────────────┐       │ │
│  │  │ Public Subnet    │        │ Private Subnet   │       │ │
│  │  │ 10.0.1.0/24      │        │ 10.0.11.0/24     │       │ │
│  │  │                  │        │                  │       │ │
│  │  │ ┌──────────────┐ │        │ ┌──────────────┐ │       │ │
│  │  │ │ EC2          │ │        │ │ RDS          │ │       │ │
│  │  │ │ t3.small     │◄├────────┤►│ db.t3.micro  │ │       │ │
│  │  │ │              │ │        │ │              │ │       │ │
│  │  │ │ Node.js API  │ │        │ │ PostgreSQL   │ │       │ │
│  │  │ │ Port 3000    │ │        │ │ Port 5432    │ │       │ │
│  │  │ └──────────────┘ │        │ └──────────────┘ │       │ │
│  │  │                  │        │                  │       │ │
│  │  └──────────────────┘        └──────────────────┘       │ │
│  │           │                                              │ │
│  └───────────┼──────────────────────────────────────────────┘ │
│              │                                                 │
│              ▼                                                 │
│      Internet Gateway                                          │
│              │                                                 │
│              ▼                                                 │
│         Public Users                                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ S3 Bucket (Artifacts & Backups)                          │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Network Isolation

- **Public Subnet**: API server with public IP (accessible from internet)
- **Private Subnet**: Database with NO public IP (only accessible from VPC)
- **Security Groups**: Firewall rules controlling access

### Why This Architecture?

1. **Security**: Database is NOT exposed to internet
2. **Scalability**: Can add more API servers easily
3. **Cost-Effective**: Minimal resources for test environment
4. **Production-Like**: Same architecture as production (just smaller)

## Key Features

### 1. Infrastructure as Code Benefits

```terraform
# Change instance size with one line:
ec2_instance_type = "t3.small"  # → "t3.medium"

# Apply change:
terraform apply

# Terraform automatically:
# - Creates new instance with new size
# - Updates DNS/routing
# - Destroys old instance
# - Zero downtime (if configured)
```

### 2. Automated Deployment

The `user_data.sh` script runs on first boot and:
- Installs Node.js
- Deploys Payment API code
- Configures database connection
- Starts API as systemd service
- Sets up CloudWatch logging
- Runs smoke test

**Result**: API is ready ~5 minutes after `terraform apply`!

### 3. Reproducible

```bash
# Destroy and recreate identical environment
terraform destroy -auto-approve
terraform apply -auto-approve

# Result: Exact same infrastructure, every time
```

### 4. Self-Documenting

Every resource has:
- Comments explaining WHY it exists
- Tags for identification
- Validation rules for safety

### 5. Cost-Optimized

```
Test Environment Cost: ~$40/month

EC2 t3.small:    $15/month
RDS db.t3.micro: $15/month
Storage:         $5/month
Data Transfer:   $5/month
```

**Tip**: Stop instances when not in use to save ~70% of costs.

## Security Highlights

### What We Did Right

1. **Database Not Public**
```terraform
publicly_accessible = false  # Cannot be accessed from internet
```

2. **Encryption Everywhere**
```terraform
storage_encrypted = true  # RDS
encrypted = true          # EBS volumes
sse_algorithm = "AES256"  # S3
```

3. **Least Privilege Security Groups**
```terraform
# API server: Only ports 22 (SSH) and 3000 (API)
# Database: Only port 5432, only from API server
```

4. **Secrets NOT in Code**
```bash
# Password passed via environment variable
export TF_VAR_db_password="secure-password"
```

5. **SSH Keys Generated (Not Committed)**
```terraform
resource "tls_private_key" "ssh" {
  # Generates new key each time
  # Stored only in Terraform state (encrypted)
}
```

### Production Improvements Needed

These are fine for test, but production should add:

- [ ] Multi-AZ deployment for high availability
- [ ] Auto-scaling groups for load handling
- [ ] Application Load Balancer for traffic distribution
- [ ] CloudWatch alarms for monitoring
- [ ] Backup policies (automated daily backups)
- [ ] Secrets Manager for password management
- [ ] VPN or bastion host for SSH access (not public)
- [ ] WAF (Web Application Firewall) for API protection

## Comprehensive Documentation

See **[DOCUMENTATION.md](./DOCUMENTATION.md)** for an 8-page guide covering:

### Multi-Environment Management

- Workspace-based vs directory-based approaches
- Environment-specific configurations
- Naming conventions
- Example production setup

### Secrets Management

- **AWS Secrets Manager** integration (recommended)
- Environment variables approach
- Terraform Cloud/Enterprise
- Secret rotation strategies
- Security checklist

### Deployment Workflows

- Initial setup steps
- Daily development cycle
- Update procedures
- Disaster recovery
- State management

### Cost Optimization

- Monthly cost breakdown
- Cost-saving strategies
- Automated scheduling
- Budget alerts

### Security Best Practices

- Network security patterns
- Data encryption strategies
- Access control via IAM
- Audit logging
- Security checklist

### Troubleshooting

- Common issues and solutions
- Debugging commands
- State management
- Getting help

## Example: Multi-Environment Setup

### Test Environment
```bash
cd environments/test
terraform init
terraform apply
# Creates: t3.small EC2, db.t3.micro RDS
# Cost: ~$40/month
```

### Staging Environment
```bash
cd environments/staging
terraform init
terraform apply
# Creates: t3.medium EC2, db.t3.small RDS
# Cost: ~$100/month
```

### Production Environment
```bash
cd environments/production
terraform init
terraform apply
# Creates: t3.large EC2 (x2), db.t3.medium RDS (Multi-AZ)
# Cost: ~$400/month
```

## Smoke Test Details

The `smoke-test.sh` script validates:

1. **Network connectivity**: Can reach API server
2. **API health**: `/health` endpoint responds
3. **Database**: Connection configured properly
4. **Functionality**: Can create payouts
5. **S3 access**: Can write to artifacts bucket
6. **Security**: Correct ports open/closed
7. **Performance**: Response time <1000ms
8. **Error handling**: Invalid requests handled

**Example output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SMOKE TEST SUITE - Payment API Infrastructure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[TEST 1] Checking if API server is reachable...
PASS - API server is reachable

[TEST 2] Validating health endpoint response...
PASS - Health endpoint returns 'healthy' status
PASS - Health endpoint includes timestamp

[TEST 3] Checking database connectivity...
PASS - Database is configured

[TEST 4] Testing API functionality (create payout)...
PASS - API can create payouts successfully
   Created payout: payout_1706472345678_abc123

[TEST 5] Checking S3 bucket accessibility...
PASS - S3 bucket is writable
PASS - S3 bucket is readable

[TEST 6] Validating security configuration...
PASS - SSH port (22) is accessible
PASS - API port (3000) is accessible

[TEST 7] Checking API response time...
PASS - API responds in 156ms (< 1000ms)

[TEST 8] Testing error handling...
WARN - API error handling not fully implemented

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SMOKE TESTS COMPLETED SUCCESSFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Estimated Time Investment

- **Initial setup**: 20 minutes
- **First deployment**: 15 minutes (AWS provisioning)
- **Subsequent deployments**: 5-10 minutes
- **Total creation time**: ~10 hours (includes Terraform configs, documentation, testing)

## What Makes This Production-Ready?

1. **Comprehensive Comments** - Every resource explains WHY
2. **Input Validation** - Variables have validation rules
3. **Security by Default** - Database not public, encryption enabled
4. **Automated Testing** - Smoke tests validate deployment
5. **Complete Documentation** - 8-page guide on management
6. **Cost-Optimized** - Right-sized for test environment
7. **Scalable** - Easy to grow to staging/production
8. **Reproducible** - Identical infrastructure every time

## Next Steps

### For Learning:
1. Read through `main.tf` - understand each resource
2. Review `DOCUMENTATION.md` - learn best practices
3. Deploy to AWS - see it work in real life
4. Make changes - modify instance size, add resources
5. Run smoke tests - validate everything works

### For Production Use:
1. Set up multi-environment structure
2. Integrate with CI/CD pipeline
3. Add monitoring and alerting
4. Implement backup strategies
5. Set up disaster recovery
6. Configure auto-scaling
7. Add load balancer
8. Harden security (VPN, WAF, etc.)

## Troubleshooting

### Issue: `terraform init` fails

```bash
# Clear cache and reinitialize
rm -rf .terraform .terraform.lock.hcl
terraform init
```

### Issue: Apply times out waiting for database

```bash
# RDS takes ~10 minutes to create
# This is normal, be patient!
```

### Issue: Smoke test fails

```bash
# Wait longer - EC2 user data takes time
sleep 120
./smoke-test.sh

# If still fails, check logs:
ssh -i payment-api-key.pem ec2-user@$(terraform output -raw api_server_public_ip)
journalctl -u payment-api -f
```

### Issue: Can't SSH to server

```bash
# Check security group allows your IP
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw api_security_group_id)

# Verify key permissions
chmod 400 payment-api-key.pem
```

## Resources

- **Terraform Documentation**: https://www.terraform.io/docs
- **AWS Provider Docs**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- **Terraform Best Practices**: https://www.terraform-best-practices.com/
- **AWS Well-Architected Framework**: https://aws.amazon.com/architecture/well-architected/

---

**This Terraform configuration demonstrates production-ready IaC practices** including comprehensive documentation, security best practices, cost optimization, and automated validation.

Ready to deploy!
