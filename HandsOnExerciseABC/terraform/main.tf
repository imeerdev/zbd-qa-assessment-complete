# ============================================
# MAIN TERRAFORM CONFIGURATION
# Test Environment Infrastructure
# ============================================
#
# This configuration creates a complete test environment for the Payment API:
# - EC2 instance for running the API
# - RDS PostgreSQL database for data persistence
# - VPC with public/private subnets
# - Security groups for network isolation
# - S3 bucket for backups and artifacts
#
# WHY THESE CHOICES:
# - EC2: Simple, cost-effective for test environments
# - RDS: Managed database (no maintenance overhead)
# - VPC: Network isolation for security
# - S3: Cheap storage for backups
# ============================================

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # BACKEND CONFIGURATION
  # Stores Terraform state remotely (not in git)
  # CRITICAL: State file contains sensitive data (passwords, IPs)
  backend "s3" {
    bucket         = "payment-api-terraform-state"
    key            = "test/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# ============================================
# PROVIDER CONFIGURATION
# ============================================

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "PaymentAPI"
      Environment = var.environment
      ManagedBy   = "Terraform"
      CostCenter  = "QA-Testing"
    }
  }
}

# ============================================
# DATA SOURCES
# Fetch information about existing resources
# ============================================

# Get available availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Get latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]
  
  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
  
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ============================================
# LOCAL VALUES
# Computed values used throughout the config
# ============================================

locals {
  # Naming convention: {project}-{environment}-{resource}
  name_prefix = "${var.project_name}-${var.environment}"
  
  # Common tags applied to all resources
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Terraform   = "true"
    CreatedBy   = "QA-Team"
  }
  
  # VPC CIDR blocks
  vpc_cidr = "10.0.0.0/16"
  
  # Subnet CIDR blocks (split VPC into smaller networks)
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]
  
  # Application port
  api_port = 3000
}

# ============================================
# VPC - NETWORK FOUNDATION
# ============================================

resource "aws_vpc" "main" {
  cidr_block           = local.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-vpc"
    }
  )
}

# Internet Gateway (allows public internet access)
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-igw"
    }
  )
}

# ============================================
# PUBLIC SUBNETS
# For resources that need internet access (API server)
# ============================================

resource "aws_subnet" "public" {
  count = length(local.public_subnet_cidrs)
  
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-public-subnet-${count.index + 1}"
      Type = "Public"
    }
  )
}

# Route table for public subnets (routes to internet gateway)
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-public-rt"
    }
  )
}

# Associate public subnets with public route table
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)
  
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ============================================
# PRIVATE SUBNETS
# For resources that don't need direct internet access (database)
# ============================================

resource "aws_subnet" "private" {
  count = length(local.private_subnet_cidrs)
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-private-subnet-${count.index + 1}"
      Type = "Private"
    }
  )
}

# Route table for private subnets
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-private-rt"
    }
  )
}

# Associate private subnets with private route table
resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)
  
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ============================================
# SECURITY GROUPS
# Firewall rules controlling network access
# ============================================

# Security group for API server
resource "aws_security_group" "api_server" {
  name        = "${local.name_prefix}-api-sg"
  description = "Security group for Payment API server"
  vpc_id      = aws_vpc.main.id
  
  # Allow SSH from anywhere (in production, restrict to office IP)
  ingress {
    description = "SSH from anywhere"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # Allow API traffic from anywhere (public API)
  ingress {
    description = "API traffic"
    from_port   = local.api_port
    to_port     = local.api_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # Allow all outbound traffic
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-api-sg"
    }
  )
}

# Security group for RDS database
resource "aws_security_group" "database" {
  name        = "${local.name_prefix}-db-sg"
  description = "Security group for RDS PostgreSQL database"
  vpc_id      = aws_vpc.main.id
  
  # Allow PostgreSQL traffic only from API server
  ingress {
    description     = "PostgreSQL from API server"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api_server.id]
  }
  
  # Allow all outbound (for updates, etc.)
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-db-sg"
    }
  )
}

# ============================================
# RDS DATABASE
# Managed PostgreSQL database
# ============================================

# Subnet group for RDS (must be in at least 2 AZs)
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-db-subnet-group"
    }
  )
}

# RDS instance
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-db"
  
  # Database engine
  engine         = "postgres"
  engine_version = "15.4"
  
  # Instance size (small for test environment)
  instance_class = var.db_instance_class
  
  # Storage configuration
  allocated_storage     = 20  # GB
  max_allocated_storage = 100 # Auto-scale up to 100GB
  storage_type          = "gp3"
  storage_encrypted     = true
  
  # Database credentials
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password # Should come from secrets manager
  
  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false # NEVER expose database to internet
  
  # Backup configuration
  backup_retention_period = 7  # Keep backups for 7 days
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"
  
  # Deletion protection (prevent accidental deletion)
  deletion_protection = var.environment == "production" ? true : false
  skip_final_snapshot = var.environment != "production"
  
  # Performance insights (for monitoring)
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-db"
    }
  )
}

# ============================================
# EC2 INSTANCE - API SERVER
# ============================================

# Generate SSH key pair
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "main" {
  key_name   = "${local.name_prefix}-key"
  public_key = tls_private_key.ssh.public_key_openssh
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-key"
    }
  )
}

# EC2 instance for API server
resource "aws_instance" "api_server" {
  ami           = data.aws_ami.amazon_linux_2.id
  instance_type = var.ec2_instance_type
  
  # Network configuration
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.api_server.id]
  associate_public_ip_address = true
  
  # SSH key for access
  key_name = aws_key_pair.main.key_name
  
  # User data script (runs on first boot)
  user_data = templatefile("${path.module}/user_data.sh", {
    db_host     = aws_db_instance.main.address
    db_port     = aws_db_instance.main.port
    db_name     = var.db_name
    db_username = var.db_username
    db_password = var.db_password
    api_port    = local.api_port
  })
  
  # Root volume configuration
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20 # GB
    delete_on_termination = true
    encrypted             = true
  }
  
  # Instance metadata
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 only (more secure)
    http_put_response_hop_limit = 1
  }
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-api-server"
    }
  )
  
  # Wait for database to be ready before creating instance
  depends_on = [aws_db_instance.main]
}

# ============================================
# S3 BUCKET
# For backups, logs, and artifacts
# ============================================

resource "aws_s3_bucket" "artifacts" {
  bucket = "${local.name_prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-artifacts"
    }
  )
}

# Enable versioning (keeps old versions of files)
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Enable encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access (security best practice)
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy (auto-delete old artifacts)
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  
  rule {
    id     = "delete-old-artifacts"
    status = "Enabled"
    
    expiration {
      days = 30 # Delete artifacts older than 30 days
    }
    
    noncurrent_version_expiration {
      noncurrent_days = 7 # Delete old versions after 7 days
    }
  }
}

# ============================================
# ADDITIONAL DATA SOURCES
# ============================================

data "aws_caller_identity" "current" {}
