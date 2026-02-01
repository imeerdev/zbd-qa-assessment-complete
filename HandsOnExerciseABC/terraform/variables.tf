# ============================================
# TERRAFORM VARIABLES
# Input parameters for the infrastructure
# ============================================
#
# These variables allow customization of the infrastructure
# without modifying the main configuration files.
#
# Values can be provided via:
# 1. terraform.tfvars file
# 2. Environment variables (TF_VAR_name)
# 3. Command line (-var="name=value")
# 4. Terraform Cloud/Enterprise workspace
# ============================================

# ============================================
# REQUIRED VARIABLES
# Must be provided when running Terraform
# ============================================

variable "db_password" {
  description = "Password for the RDS database (should come from secrets manager)"
  type        = string
  sensitive   = true
  
  validation {
    condition     = length(var.db_password) >= 16
    error_message = "Database password must be at least 16 characters long."
  }
}

# ============================================
# ENVIRONMENT CONFIGURATION
# ============================================

variable "environment" {
  description = "Environment name (test, staging, production)"
  type        = string
  default     = "test"
  
  validation {
    condition     = contains(["test", "staging", "production"], var.environment)
    error_message = "Environment must be test, staging, or production."
  }
}

variable "project_name" {
  description = "Project name used in resource naming"
  type        = string
  default     = "payment-api"
}

# ============================================
# AWS CONFIGURATION
# ============================================

variable "aws_region" {
  description = "AWS region where resources will be created"
  type        = string
  default     = "us-east-1"
}

# ============================================
# COMPUTE RESOURCES
# ============================================

variable "ec2_instance_type" {
  description = "EC2 instance type for API server"
  type        = string
  default     = "t3.small"  # 2 vCPU, 2GB RAM - good for test environment
  
  # Different instance types for different environments
  # test: t3.small
  # staging: t3.medium
  # production: t3.large or higher
}

# ============================================
# DATABASE CONFIGURATION
# ============================================

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"  # Smallest RDS instance - good for test
  
  # test: db.t3.micro (1 vCPU, 1GB RAM)
  # staging: db.t3.small (2 vCPU, 2GB RAM)
  # production: db.t3.medium or higher
}

variable "db_name" {
  description = "Name of the database to create"
  type        = string
  default     = "payment_api"
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
  default     = "dbadmin"
  sensitive   = true
}

# ============================================
# NETWORK CONFIGURATION
# ============================================

variable "allowed_ssh_cidr_blocks" {
  description = "List of CIDR blocks allowed to SSH to the API server"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Allow from anywhere (restrict in production!)
  
  # In production, should be something like:
  # ["10.0.0.0/8"]  # Only from office network
  # Or use AWS Systems Manager Session Manager instead of SSH
}

# ============================================
# FEATURE FLAGS
# Toggle features on/off per environment
# ============================================

variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and alerting"
  type        = bool
  default     = true
}

variable "enable_backups" {
  description = "Enable automated database backups"
  type        = bool
  default     = true
}

variable "enable_encryption" {
  description = "Enable encryption for data at rest"
  type        = bool
  default     = true
}

# ============================================
# COST OPTIMIZATION
# ============================================

variable "enable_autoscaling" {
  description = "Enable EC2 auto-scaling"
  type        = bool
  default     = false  # Not needed for test environment
}

variable "instance_count" {
  description = "Number of API server instances"
  type        = number
  default     = 1
  
  validation {
    condition     = var.instance_count > 0 && var.instance_count <= 10
    error_message = "Instance count must be between 1 and 10."
  }
}

# ============================================
# APPLICATION DEPLOYMENT
# ============================================

variable "app_repo_url" {
  description = "Git repository URL for the Payment API code"
  type        = string
  default     = "https://github.com/your-username/zbd-qa-assessment.git"

  # This should point to your GitHub repo containing the assessment
  # The API code is in: HandsOnExerciseABC/
}

variable "app_repo_branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "main"
}

variable "api_port" {
  description = "Port the Payment API listens on"
  type        = number
  default     = 3000
}

# ============================================
# TAGS
# ============================================

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
  
  # Example:
  # {
  #   "Owner" = "qa-team@company.com"
  #   "CostCenter" = "Engineering"
  # }
}
