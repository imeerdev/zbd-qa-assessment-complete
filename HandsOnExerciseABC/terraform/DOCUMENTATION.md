# Infrastructure as Code Documentation
## Multi-Environment Management & Secrets Strategy

---

## Table of Contents
1. [Overview](#overview)
2. [Multi-Environment Strategy](#multi-environment-strategy)
3. [Secrets Management](#secrets-management)
4. [Deployment Workflow](#deployment-workflow)
5. [Cost Optimization](#cost-optimization)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This Terraform configuration creates a complete test environment for the Payment API with:

- **Compute**: EC2 instance running the API server
- **Database**: RDS PostgreSQL for data persistence
- **Networking**: VPC with public/private subnets for security
- **Storage**: S3 bucket for backups and artifacts
- **Security**: Security groups isolating network access

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         AWS CLOUD                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ VPC (10.0.0.0/16)                                        │ │
│  │                                                           │ │
│  │  ┌─────────────────┐        ┌─────────────────┐         │ │
│  │  │ Public Subnet   │        │ Private Subnet  │         │ │
│  │  │ (10.0.1.0/24)   │        │ (10.0.11.0/24)  │         │ │
│  │  │                 │        │                 │         │ │
│  │  │  ┌───────────┐  │        │  ┌───────────┐ │         │ │
│  │  │  │ EC2       │  │        │  │   RDS     │ │         │ │
│  │  │  │ API Server│◄─┼────────┼──│PostgreSQL │ │         │ │
│  │  │  │           │  │        │  │           │ │         │ │
│  │  │  └─────┬─────┘  │        │  └───────────┘ │         │ │
│  │  │        │        │        │                 │         │ │
│  │  └────────┼────────┘        └─────────────────┘         │ │
│  │           │                                              │ │
│  └───────────┼──────────────────────────────────────────────┘ │
│              │                                                 │
│              ▼                                                 │
│      Internet Gateway                                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ S3 Bucket                                                │ │
│  │ (Artifacts & Backups)                                    │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## Multi-Environment Strategy

### Environment Separation

We manage three environments with **identical infrastructure** but different **sizing** and **configurations**:

| Environment | Purpose | Instance Size | Database Size | Cost/Month |
|-------------|---------|---------------|---------------|------------|
| **Test** | QA testing, experiments | t3.small | db.t3.micro | $40-60 |
| **Staging** | Pre-production validation | t3.medium | db.t3.small | $80-120 |
| **Production** | Live customer traffic | t3.large+ | db.t3.medium+ | $200-400+ |

### Approach 1: Separate Terraform Workspaces (Recommended for Beginners)

```bash
# Create workspaces
terraform workspace new test
terraform workspace new staging
terraform workspace new production

# Switch between environments
terraform workspace select test
terraform plan
terraform apply
```

**Pros**:
- Simple to set up
- Shares same code
- Easy to switch between environments

**Cons**:
- All environments share same backend state bucket
- Easy to accidentally apply to wrong environment
- Less isolation

### Approach 2: Separate Directories (Recommended for Production)

```
infrastructure/
├── modules/
│   └── payment-api/   # Reusable module
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
│
├── environments/
│   ├── test/
│   │   ├── main.tf   # Uses module
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   │
│   ├── staging/
│   │   ├── main.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   │
│   └── production/
│       ├── main.tf
│       ├── terraform.tfvars
│       └── backend.tf
```

**Pros**:
- Complete isolation between environments
- Different backend states
- Harder to make mistakes
- Can have environment-specific customizations

**Cons**:
- More complex setup
- Need to maintain multiple directories

### Example: Environment-Specific Variables

```hcl
# environments/test/terraform.tfvars
environment       = "test"
ec2_instance_type = "t3.small"
db_instance_class = "db.t3.micro"
enable_backups    = false  # Save cost in test

# environments/production/terraform.tfvars
environment       = "production"
ec2_instance_type = "t3.large"
db_instance_class = "db.t3.medium"
enable_backups    = true
enable_encryption = true
```

### Environment Naming Convention

Follow a consistent naming pattern:

```
{project}-{environment}-{resource}-{identifier}

Examples:
- payment-api-test-api-server-01
- payment-api-prod-db-primary
- payment-api-staging-s3-artifacts
```

**Benefits**:
- Easy to identify which environment a resource belongs to
- Searchable in AWS console
- Avoids accidental cross-environment actions

---

## Secrets Management

### CRITICAL: Never Store Secrets in Code!

**NEVER DO THIS**:
```hcl
variable "db_password" {
  default = "supersecret123"  # EXPOSED IN GIT!
}
```

### Approach 1: AWS Secrets Manager (Recommended)

**Step 1: Store secrets in AWS**
```bash
# Create database password
aws secretsmanager create-secret \
  --name payment-api/test/db-password \
  --secret-string "$(openssl rand -base64 32)"

# Store API keys
aws secretsmanager create-secret \
  --name payment-api/test/api-keys \
  --secret-string '{"admin":"key123","readonly":"key456"}'
```

**Step 2: Reference in Terraform**
```hcl
# Fetch secret from AWS Secrets Manager
data "aws_secretsmanager_secret" "db_password" {
  name = "payment-api/${var.environment}/db-password"
}

data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = data.aws_secretsmanager_secret.db_password.id
}

# Use in RDS resource
resource "aws_db_instance" "main" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
  # ...
}
```

**Benefits**:
- Secrets never in Terraform state (still encrypted, but extra safety)
- Rotation supported
- Audit logging
- IAM-based access control

**Cost**: ~$0.40/month per secret

### Approach 2: Environment Variables (Good for Local/CI)

```bash
# Set environment variable
export TF_VAR_db_password="$(openssl rand -base64 32)"

# Terraform automatically picks it up
terraform apply
```

**Benefits**:
- Free
- Simple for CI/CD pipelines
- No AWS dependency

**Drawbacks**:
- Must manage distribution
- No rotation
- Visible in process list

### Approach 3: Terraform Cloud/Enterprise (Best for Teams)

```hcl
# terraform.tf
cloud {
  organization = "my-company"
  workspaces {
    name = "payment-api-test"
  }
}
```

Store secrets as **sensitive variables** in Terraform Cloud UI.

**Benefits**:
- Encrypted at rest
- Role-based access
- Audit logging
- Built-in state locking
- Free for small teams

### Secret Rotation Strategy

```bash
# Automated rotation script (run monthly)
#!/bin/bash

# Generate new password
NEW_PASS=$(openssl rand -base64 32)

# Update in Secrets Manager
aws secretsmanager update-secret \
  --secret-id payment-api/prod/db-password \
  --secret-string "$NEW_PASS"

# Update RDS password
aws rds modify-db-instance \
  --db-instance-identifier payment-api-prod-db \
  --master-user-password "$NEW_PASS" \
  --apply-immediately

# Restart API servers to pick up new password
# (This would typically be automated via rolling update)
```

### Secrets Checklist

- [ ] Database passwords stored in Secrets Manager
- [ ] API keys stored in Secrets Manager  
- [ ] SSH private keys NOT in git (generated by Terraform)
- [ ] AWS access keys NOT in code (use IAM roles)
- [ ] Terraform state encrypted (backend.tf has `encrypt = true`)
- [ ] Secrets Manager enabled in production
- [ ] Rotation policy defined for production secrets
- [ ] All team members use MFA on AWS accounts

---

## Deployment Workflow

### Initial Setup (One-Time)

```bash
# 1. Initialize Terraform
terraform init

# 2. Validate configuration
terraform validate

# 3. Check formatting
terraform fmt -check

# 4. Create a plan
terraform plan -out=tfplan

# 5. Review the plan carefully
# Look for any unexpected changes

# 6. Apply the plan
terraform apply tfplan

# 7. Save outputs
terraform output > infrastructure-outputs.txt
```

### Daily Development Workflow

```bash
# 1. Make changes to .tf files

# 2. Format code
terraform fmt

# 3. Validate
terraform validate

# 4. Plan to see changes
terraform plan

# 5. If changes look good, apply
terraform apply -auto-approve  # Only in test environment!
```

### Updating Infrastructure

```bash
# 1. Check current state
terraform show

# 2. Plan changes
terraform plan

# 3. Review carefully for:
#    - Resources being destroyed (⚠️ data loss risk)
#    - Security group changes (⚠️ access risk)
#    - Database modifications (⚠️ downtime risk)

# 4. Apply with confirmation
terraform apply  # Will ask for "yes"

# 5. Verify deployment
./smoke-test.sh
```

### Destroying Infrastructure

```bash
# ⚠️ DANGER ZONE ⚠️

# Preview what will be destroyed
terraform plan -destroy

# Destroy everything
terraform destroy

# Or destroy specific resource
terraform destroy -target=aws_instance.api_server
```

**Protection**: In production, set `deletion_protection = true` on critical resources.

### Handling State Files

```bash
# View current state
terraform state list

# Show specific resource
terraform state show aws_instance.api_server

# Remove resource from state (without destroying)
terraform state rm aws_instance.api_server

# Import existing resource into state
terraform import aws_instance.api_server i-1234567890abcdef0

# Pull remote state locally
terraform state pull > backup-state.json

# Push local state to remote
terraform state push backup-state.json
```

---

## Cost Optimization

### Monthly Cost Breakdown (Test Environment)

```
EC2 t3.small (730 hours):     $15.33
RDS db.t3.micro (730 hours):  $14.60
EBS Storage (20GB x 2):       $3.20
Data Transfer (est.):         $5.00
S3 Storage (10GB):            $0.23
NAT Gateway:                  $0.00 (not using)
────────────────────────────────────
TOTAL:                        ~$38.36/month
```

### Cost Saving Tips

1. **Stop instances when not in use**
```bash
# Stop EC2 instance (keeps data, stops compute charges)
aws ec2 stop-instances --instance-ids $(terraform output -raw api_server_id)

# Stop RDS (saves ~50% of cost)
aws rds stop-db-instance --db-instance-identifier payment-api-test-db
```

2. **Use spot instances for test environments**
```hcl
resource "aws_instance" "api_server" {
  instance_market_options {
    market_type = "spot"
    spot_options {
      max_price = "0.01"  # 70% cheaper than on-demand
    }
  }
}
```

3. **Downsize when possible**
```hcl
# Test environment
instance_type = "t3.micro"    # $7/month
db_instance_class = "db.t3.micro"  # $14/month
```

4. **Set up automated schedules**
```bash
# Lambda function to stop instances at 6 PM, start at 8 AM
# Saves 14 hours/day = ~60% cost reduction
```

5. **Delete unused resources**
```bash
# Find old snapshots
aws ec2 describe-snapshots --owner-ids self \
  --query 'Snapshots[?StartTime<=`2025-01-01`]'

# Delete them
aws ec2 delete-snapshot --snapshot-id snap-xxxxx
```

### Monthly Budget Alert

```bash
# Set up billing alert via AWS Budgets
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://budget.json
```

---

## Security Best Practices

### Network Security

1. **Principle of Least Privilege**
```hcl
# Good: Only allow necessary ports
ingress {
  from_port   = 3000
  to_port     = 3000
  cidr_blocks = ["10.0.0.0/8"]  # Only from VPC
}

# Bad: Opening everything
ingress {
  from_port   = 0
  to_port     = 65535
  cidr_blocks = ["0.0.0.0/0"]  # Entire internet!
}
```

2. **Database Never Public**
```hcl
resource "aws_db_instance" "main" {
  publicly_accessible = false  # ALWAYS false in production
}
```

3. **Use Private Subnets**
```
Public Subnet:  API server (needs internet)
Private Subnet: Database (no internet access)
```

### Data Security

1. **Encryption at Rest**
```hcl
resource "aws_db_instance" "main" {
  storage_encrypted = true  # Encrypt database
}

resource "aws_ebs_volume" "data" {
  encrypted = true  # Encrypt disks
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  # Encrypt S3 objects
}
```

2. **Encryption in Transit**
```hcl
# Require HTTPS for S3
resource "aws_s3_bucket_policy" "enforce_https" {
  policy = jsonencode({
    Statement = [{
      Effect = "Deny"
      Principal = "*"
      Action = "s3:*"
      Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
    }]
  })
}
```

### Access Control

1. **Use IAM Roles (Not Keys)**
```hcl
resource "aws_iam_instance_profile" "api_server" {
  role = aws_iam_role.api_server.name
}

resource "aws_instance" "api_server" {
  iam_instance_profile = aws_iam_instance_profile.api_server.name
  # No AWS keys needed on instance!
}
```

2. **MFA for Destructive Actions**
```bash
# Require MFA to destroy infrastructure
# Add to backend.tf:
dynamodb_table = "terraform-lock"
# This table has MFA delete enabled
```

3. **Audit Logging**
```hcl
# Enable CloudTrail
resource "aws_cloudtrail" "audit" {
  s3_bucket_name = aws_s3_bucket.audit_logs.id
  enable_logging = true
  
  event_selector {
    read_write_type           = "WriteOnly"  # Log all changes
    include_management_events = true
  }
}
```

### Security Checklist

- [ ] Database not publicly accessible
- [ ] All data encrypted at rest
- [ ] HTTPS enforced for all services
- [ ] IAM roles used (no hardcoded keys)
- [ ] Security groups follow least privilege
- [ ] MFA enabled on AWS root account
- [ ] CloudTrail logging enabled
- [ ] SSH keys stored securely (not in git)
- [ ] Secrets in Secrets Manager (not in code)
- [ ] Regular security audits scheduled

---

## Troubleshooting

### Common Issues

#### Issue 1: `terraform init` fails

**Error**: `Backend configuration changed`

**Solution**:
```bash
terraform init -reconfigure
```

#### Issue 2: State is locked

**Error**: `Error locking state: ConditionalCheckFailedException`

**Solution**:
```bash
# Remove lock (only if you're sure no one else is running terraform)
terraform force-unlock <LOCK_ID>
```

#### Issue 3: Resource already exists

**Error**: `AlreadyExists: VPC vpc-xxxxx already exists`

**Solution**:
```bash
# Import existing resource
terraform import aws_vpc.main vpc-xxxxx
```

#### Issue 4: Permission denied

**Error**: `AccessDenied: User is not authorized`

**Solution**:
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify IAM permissions
aws iam get-user-policy --user-name <USERNAME> --policy-name <POLICY>
```

#### Issue 5: Smoke test fails

**Error**: API not reachable after apply

**Check**:
1. Instance status: `aws ec2 describe-instance-status`
2. Security groups: `aws ec2 describe-security-groups`
3. User data logs: `ssh ec2-user@<IP> -i key.pem "tail -f /var/log/user-data.log"`

### Debugging Commands

```bash
# Enable debug logging
export TF_LOG=DEBUG
terraform plan

# Show plan in JSON
terraform show -json tfplan | jq

# Check current state
terraform state list
terraform state show <RESOURCE>

# Refresh state from AWS
terraform refresh

# SSH to instance for debugging
terraform output -raw ssh_private_key > key.pem
chmod 400 key.pem
ssh -i key.pem ec2-user@$(terraform output -raw api_server_public_ip)

# Check API server logs
ssh ... "journalctl -u payment-api -f"

# Check database connectivity
ssh ... "pg_isready -h <DB_HOST> -p 5432"
```

### Getting Help

```bash
# Terraform documentation
terraform -help plan

# AWS CLI documentation
aws ec2 help
aws rds help

# Validate configuration
terraform validate

# Check for formatting issues
terraform fmt -check -diff
```

---

## Next Steps

1. **Set up CI/CD**
   - Automate `terraform apply` on merge to main
   - Require plan approval for production

2. **Add Monitoring**
   - CloudWatch dashboards
   - SNS alerts for failures
   - Cost anomaly detection

3. **Implement DR**
   - Automated backups
   - Multi-region deployment
   - Disaster recovery runbook

4. **Scale Up**
   - Auto-scaling groups
   - Load balancers
   - Read replicas

---

**Total Page Count**: ~8 pages
**Last Updated**: January 28, 2026
**Maintained By**: QA Team
