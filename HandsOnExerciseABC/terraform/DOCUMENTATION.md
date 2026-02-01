# Terraform Deep Dive

Advanced guide covering multi-environment management, secrets, security, costs, and troubleshooting.

---

## Multi-Environment Strategy

| Environment | Instance | Database | Cost/Month |
|-------------|----------|----------|------------|
| Test | t3.small | db.t3.micro | ~$40 |
| Staging | t3.medium | db.t3.small | ~$100 |
| Production | t3.large+ | db.t3.medium+ | ~$300+ |

### Option 1: Terraform Workspaces

```bash
terraform workspace new test
terraform workspace new staging
terraform workspace select test
terraform apply
```

### Option 2: Separate Directories (Recommended for Production)

```
infrastructure/
├── modules/payment-api/    # Reusable module
├── environments/
│   ├── test/
│   ├── staging/
│   └── production/
```

---

## Secrets Management

**Never store secrets in code.**

### AWS Secrets Manager (Recommended)

```bash
# Store secret
aws secretsmanager create-secret \
  --name payment-api/test/db-password \
  --secret-string "$(openssl rand -base64 32)"
```

```hcl
# Reference in Terraform
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "payment-api/${var.environment}/db-password"
}

resource "aws_db_instance" "main" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}
```

### Environment Variables (Simple)

```bash
export TF_VAR_db_password="$(openssl rand -base64 32)"
terraform apply
```

---

## Security Best Practices

### Network Security

```hcl
# Good: Restrict access
ingress {
  from_port   = 3000
  to_port     = 3000
  cidr_blocks = ["10.0.0.0/8"]  # VPC only
}

# Bad: Open to internet
cidr_blocks = ["0.0.0.0/0"]  # Never do this for databases
```

### Data Encryption

```hcl
resource "aws_db_instance" "main" {
  storage_encrypted   = true
  publicly_accessible = false  # Always false for databases
}
```

### Checklist

- [ ] Database not publicly accessible
- [ ] All storage encrypted at rest
- [ ] IAM roles used (no hardcoded keys)
- [ ] Security groups follow least privilege
- [ ] Secrets in Secrets Manager

---

## Cost Optimization

### Monthly Breakdown (Test)

```
EC2 t3.small:     $15
RDS db.t3.micro:  $15
Storage (20GB):   $3
Data transfer:    $5
─────────────────────
Total:            ~$38/month
```

### Cost Saving Tips

1. **Stop instances when not in use** - saves ~70%
2. **Use spot instances** for test environments
3. **Schedule auto-stop** at 6 PM, auto-start at 8 AM
4. **Right-size** - start small, scale up as needed

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `terraform init` fails | `terraform init -reconfigure` |
| State is locked | `terraform force-unlock <LOCK_ID>` |
| Resource already exists | `terraform import aws_vpc.main vpc-xxxxx` |
| Permission denied | Check `aws sts get-caller-identity` |

### Debug Commands

```bash
# Enable debug logging
export TF_LOG=DEBUG
terraform plan

# Check state
terraform state list
terraform state show <RESOURCE>

# SSH and check logs
ssh -i key.pem ec2-user@<IP>
journalctl -u payment-api -f
```

---

## Deployment Workflow

### Daily Development

```bash
terraform fmt       # Format code
terraform validate  # Check syntax
terraform plan      # Preview changes
terraform apply     # Apply changes
```

### Destroying Resources

```bash
terraform plan -destroy  # Preview
terraform destroy        # Execute
```

**Protection**: Set `deletion_protection = true` on critical resources.
