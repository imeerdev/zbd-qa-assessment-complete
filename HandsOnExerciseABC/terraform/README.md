# Infrastructure as Code (Terraform)

## Overview

Terraform configuration that deploys the **Payment API** to AWS with:
- EC2 instance running the API
- RDS PostgreSQL database
- VPC with public/private subnets
- S3 bucket for artifacts
- Automated deployment via user_data.sh

**Cost**: ~$40/month for test environment

---

## Quick Start

### Prerequisites

- AWS CLI configured (`aws configure`)
- Terraform >= 1.0 (`brew install terraform`)

### Deploy

```bash
cd HandsOnExerciseABC/terraform

# Configure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: set app_repo_url to your GitHub repo

# Set database password
export TF_VAR_db_password="$(openssl rand -base64 32)"

# Deploy
terraform init
terraform plan
terraform apply
```

### Verify

```bash
# Wait for instance to boot (~2 min)
./smoke-test.sh

# Test the API
curl $(terraform output -raw api_endpoint)/health
```

### SSH Access

```bash
terraform output -raw ssh_private_key > key.pem
chmod 400 key.pem
ssh -i key.pem ec2-user@$(terraform output -raw api_server_public_ip)
```

### Cleanup

```bash
terraform destroy
```

---

## Files

| File | Purpose |
|------|---------|
| main.tf | AWS resources (VPC, EC2, RDS, S3) |
| variables.tf | Input variables |
| outputs.tf | Output values (IPs, endpoints) |
| user_data.sh | EC2 bootstrap script |
| smoke-test.sh | Deployment validation |
| DOCUMENTATION.md | Detailed guide (multi-env, secrets, security) |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│ VPC (10.0.0.0/16)                               │
│                                                 │
│  ┌─────────────────┐    ┌─────────────────┐   │
│  │ Public Subnet   │    │ Private Subnet  │   │
│  │                 │    │                 │   │
│  │  EC2 (API)     │◄──►│  RDS (Postgres) │   │
│  │  Port 3000      │    │  Port 5432      │   │
│  └────────┬────────┘    └─────────────────┘   │
│           │                                    │
└───────────┼────────────────────────────────────┘
            ▼
    Internet Gateway → Users
```

- **Public subnet**: API server (internet accessible)
- **Private subnet**: Database (VPC only)

---

## For More Details

See [DOCUMENTATION.md](./DOCUMENTATION.md) for:
- Multi-environment management
- Secrets handling strategies
- Security best practices
- Cost optimization tips
- Troubleshooting guide
