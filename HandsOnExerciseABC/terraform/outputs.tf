# ============================================
# TERRAFORM OUTPUTS
# Values exposed after infrastructure creation
# ============================================
#
# Outputs are useful for:
# 1. Getting information about created resources
# 2. Passing values to other Terraform modules
# 3. Automation scripts that need resource IDs
# 4. Displaying important info to operators
# ============================================

# ============================================
# NETWORK OUTPUTS
# ============================================

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

# ============================================
# API SERVER OUTPUTS
# ============================================

output "api_server_public_ip" {
  description = "Public IP address of the API server"
  value       = aws_instance.api_server.public_ip
}

output "api_server_public_dns" {
  description = "Public DNS name of the API server"
  value       = aws_instance.api_server.public_dns
}

output "api_server_id" {
  description = "Instance ID of the API server"
  value       = aws_instance.api_server.id
}

output "api_endpoint" {
  description = "Full API endpoint URL"
  value       = "http://${aws_instance.api_server.public_ip}:${local.api_port}"
}

# ============================================
# DATABASE OUTPUTS
# ============================================

output "database_endpoint" {
  description = "Connection endpoint for the database"
  value       = aws_db_instance.main.endpoint
  sensitive   = true  # Don't show in logs by default
}

output "database_address" {
  description = "Hostname of the database"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "database_port" {
  description = "Port of the database"
  value       = aws_db_instance.main.port
}

output "database_name" {
  description = "Name of the database"
  value       = aws_db_instance.main.db_name
}

output "database_arn" {
  description = "ARN of the database instance"
  value       = aws_db_instance.main.arn
}

# ============================================
# STORAGE OUTPUTS
# ============================================

output "artifacts_bucket_name" {
  description = "Name of the S3 artifacts bucket"
  value       = aws_s3_bucket.artifacts.id
}

output "artifacts_bucket_arn" {
  description = "ARN of the S3 artifacts bucket"
  value       = aws_s3_bucket.artifacts.arn
}

# ============================================
# SSH ACCESS
# ============================================

output "ssh_private_key" {
  description = "Private SSH key to access the API server"
  value       = tls_private_key.ssh.private_key_pem
  sensitive   = true  # NEVER print this to console!
}

output "ssh_command" {
  description = "SSH command to connect to the API server"
  value       = "ssh -i payment-api-key.pem ec2-user@${aws_instance.api_server.public_ip}"
}

# ============================================
# SECURITY GROUP OUTPUTS
# ============================================

output "api_security_group_id" {
  description = "Security group ID for the API server"
  value       = aws_security_group.api_server.id
}

output "database_security_group_id" {
  description = "Security group ID for the database"
  value       = aws_security_group.database.id
}

# ============================================
# QUICK REFERENCE
# Human-readable summary of the infrastructure
# ============================================

output "quick_reference" {
  description = "Quick reference guide for the deployed infrastructure"
  value = <<-EOT
  
  ╔══════════════════════════════════════════════════════════════════╗
  ║         PAYMENT API TEST ENVIRONMENT - QUICK REFERENCE          ║
  ╠══════════════════════════════════════════════════════════════════╣
  ║                                                                  ║
  ║  API ENDPOINT:                                                   ║
  ║  http://${aws_instance.api_server.public_ip}:${local.api_port}                                    ║
  ║                                                                  ║
  ║  SSH ACCESS:                                                     ║
  ║  ssh -i payment-api-key.pem ec2-user@${aws_instance.api_server.public_ip}          ║
  ║                                                                  ║
  ║  DATABASE:                                                       ║
  ║  Host: ${aws_db_instance.main.address}                                           ║
  ║  Port: ${aws_db_instance.main.port}                                                    ║
  ║  Name: ${aws_db_instance.main.db_name}                                              ║
  ║                                                                  ║
  ║  ARTIFACTS BUCKET:                                               ║
  ║  ${aws_s3_bucket.artifacts.id}                                                    ║
  ║                                                                  ║
  ║  NEXT STEPS:                                                     ║
  ║  1. Save SSH private key:                                        ║
  ║     terraform output -raw ssh_private_key > payment-api-key.pem  ║
  ║     chmod 400 payment-api-key.pem                                ║
  ║                                                                  ║
  ║  2. Test API health:                                             ║
  ║     curl http://${aws_instance.api_server.public_ip}:${local.api_port}/health                      ║
  ║                                                                  ║
  ║  3. Run smoke tests:                                             ║
  ║     ./smoke-test.sh                                              ║
  ║                                                                  ║
  ╚══════════════════════════════════════════════════════════════════╝
  
  EOT
}

# ============================================
# COST ESTIMATION
# ============================================

output "estimated_monthly_cost" {
  description = "Rough estimate of monthly AWS costs (USD)"
  value = <<-EOT
  Estimated Monthly Cost (USD):
  
  EC2 Instance (${var.ec2_instance_type}):   $15-25/month
  RDS Instance (${var.db_instance_class}):  $15-20/month
  Data Transfer:                             $5-10/month
  S3 Storage:                                $1-5/month
  
  TOTAL: ~$40-60/month
  
  Note: Actual costs may vary based on usage.
  Use AWS Cost Explorer for precise tracking.
  EOT
}
